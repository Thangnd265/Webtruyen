/**
 * Client-Side Audio Storage Engine (IndexedDB + Blob URLs)
 * Persists 100% full audio files on the user's device (phone/PC)
 * to guarantee zero-latency, gapless playback even under weak networks or offline.
 */

const DB_NAME = "webtruyen_audio_db";
const STORE_NAME = "audio_records";
const DB_VERSION = 1;
const MAX_CACHED_CHAPTERS = 3;

interface StoredAudio {
  url: string;
  blob: Blob;
  size: number;
  timestamp: number;
}

// In-memory pool of active Object URLs to prevent repeated recreation
const activeBlobUrlMap = new Map<string, string>();
// Fallback in-memory map if IndexedDB is unavailable
const memoryFallbackMap = new Map<string, { blob: Blob; timestamp: number }>();

function openAudioDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("Could not open IndexedDB audio store:", request.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB open error:", err);
      resolve(null);
    }
  });
}

/**
 * Saves a downloaded audio Blob directly to device storage and returns a Blob URL.
 */
export async function saveAudioToDevice(url: string, blob: Blob): Promise<string> {
  const now = Date.now();
  const blobUrl = URL.createObjectURL(blob);

  // Revoke previous blobUrl for this exact URL if one existed
  const oldUrl = activeBlobUrlMap.get(url);
  if (oldUrl) {
    try {
      URL.revokeObjectURL(oldUrl);
    } catch {}
  }
  activeBlobUrlMap.set(url, blobUrl);

  const db = await openAudioDB();
  if (!db) {
    memoryFallbackMap.set(url, { blob, timestamp: now });
    enforceMemoryLimit();
    return blobUrl;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const record: StoredAudio = {
        url,
        blob,
        size: blob.size,
        timestamp: now,
      };

      store.put(record);

      tx.oncomplete = () => {
        pruneOldAudio(db).catch(() => {});
        resolve(blobUrl);
      };
      tx.onerror = () => {
        resolve(blobUrl);
      };
    } catch (err) {
      resolve(blobUrl);
    }
  });
}

/**
 * Retrieves a locally saved audio file as a Blob URL.
 * Returns null if not cached on the device.
 */
export async function getAudioFromDevice(url: string): Promise<string | null> {
  if (!url) return null;

  // 1. Instant check in memory pool (0ms)
  if (activeBlobUrlMap.has(url)) {
    return activeBlobUrlMap.get(url)!;
  }

  // 2. Memory fallback check
  if (memoryFallbackMap.has(url)) {
    const item = memoryFallbackMap.get(url)!;
    const blobUrl = URL.createObjectURL(item.blob);
    activeBlobUrlMap.set(url, blobUrl);
    return blobUrl;
  }

  // 3. Persistent IndexedDB check
  const db = await openAudioDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);

      req.onsuccess = () => {
        const record = req.result as StoredAudio | undefined;
        if (record && record.blob) {
          const blobUrl = URL.createObjectURL(record.blob);
          activeBlobUrlMap.set(url, blobUrl);
          resolve(blobUrl);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Checks synchronously if an active Blob URL already exists in memory.
 */
export function getActiveBlobUrlSync(url: string): string | null {
  return activeBlobUrlMap.get(url) || null;
}

/**
 * Evicts oldest audio files when count exceeds MAX_CACHED_CHAPTERS.
 */
async function pruneOldAudio(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const countReq = store.count();

      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count <= MAX_CACHED_CHAPTERS) {
          resolve();
          return;
        }

        const toDeleteCount = count - MAX_CACHED_CHAPTERS;
        let deleted = 0;

        const cursorReq = index.openCursor(); // Oldest first
        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
          if (cursor && deleted < toDeleteCount) {
            const oldUrl = cursor.value.url;
            const memBlobUrl = activeBlobUrlMap.get(oldUrl);
            if (memBlobUrl) {
              try {
                URL.revokeObjectURL(memBlobUrl);
              } catch {}
              activeBlobUrlMap.delete(oldUrl);
            }
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => resolve();
      };
      countReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function enforceMemoryLimit(): void {
  if (memoryFallbackMap.size > MAX_CACHED_CHAPTERS) {
    const sorted = Array.from(memoryFallbackMap.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const toRemove = sorted.slice(0, memoryFallbackMap.size - MAX_CACHED_CHAPTERS);
    for (const [key] of toRemove) {
      const url = activeBlobUrlMap.get(key);
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        activeBlobUrlMap.delete(key);
      }
      memoryFallbackMap.delete(key);
    }
  }
}
