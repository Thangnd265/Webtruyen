export interface PlaybackProgress {
  book_slug: string;
  book_title: string;
  book_author?: string;
  book_cover?: string;
  chapter_id: string;
  chapter_title: string;
  current_time: number;
  duration: number;
  progress: number;
  updated_at: number; // Unix timestamp in ms
}

const STORAGE_PREFIX = "webtruyen_audio_progress_";

/**
 * Saves playback progress immediately to localStorage and syncs with cloud if token is provided.
 * Uses keepalive: true on page unload / visibilitychange to prevent request drops.
 */
export function savePlaybackProgress(
  item: Omit<PlaybackProgress, "updated_at">,
  token?: string | null,
  options?: { keepalive?: boolean }
): void {
  const now = Date.now();
  const progress: PlaybackProgress = {
    ...item,
    updated_at: now,
  };

  // 1. Instant local persistence (no network lag, survives crashes & refreshes)
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${item.book_slug}`, JSON.stringify(progress));
  } catch (err) {
    console.warn("Could not save playback progress to localStorage:", err);
  }

  // 2. Remote cloud sync for multi-device continuity (Phone <-> PC)
  if (token && item.book_slug && item.chapter_id) {
    const payload = JSON.stringify({
      book_slug: item.book_slug,
      book_title: item.book_title || item.book_slug,
      book_author: item.book_author || "",
      book_cover: item.book_cover || "",
      chapter_id: item.chapter_id,
      chapter_title: item.chapter_title || "",
      current_time: item.current_time || 0,
      duration: item.duration || 0,
      progress:
        item.duration > 0
          ? Number(((item.current_time || 0) / item.duration).toFixed(4))
          : 0,
    });

    if (options?.keepalive && typeof fetch === "function") {
      fetch("/api/user/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } else {
      fetch("/api/user/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      }).catch((err) => console.warn("Sync history error:", err));
    }
  }
}

/**
 * Reads locally saved progress synchronously (fast, 0ms latency).
 */
export function getLocalPlaybackProgress(slug: string): PlaybackProgress | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${slug}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Compares local vs server progress timestamps and returns the freshest state.
 * Syncs the newer state to local storage.
 */
export async function getBestPlaybackProgress(
  slug: string,
  token?: string | null
): Promise<PlaybackProgress | null> {
  const local = getLocalPlaybackProgress(slug);

  if (!token) {
    return local;
  }

  try {
    const res = await fetch(`/api/user/history/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const serverData = await res.json();
      if (serverData && serverData.chapter_id) {
        let serverTimestamp = 0;
        if (serverData.updated_at) {
          const parsed = Date.parse(serverData.updated_at);
          if (!Number.isNaN(parsed)) serverTimestamp = parsed;
        }

        const serverItem: PlaybackProgress = {
          book_slug: serverData.book_slug || slug,
          book_title: serverData.book_title || "",
          book_author: serverData.book_author || "",
          book_cover: serverData.book_cover || "",
          chapter_id: serverData.chapter_id,
          chapter_title: serverData.chapter_title || "",
          current_time: serverData.current_time || 0,
          duration: serverData.duration || 0,
          progress: serverData.progress || 0,
          updated_at: serverTimestamp,
        };

        // If local exists and is strictly more recent than server, return local
        if (local && local.updated_at && local.updated_at > serverTimestamp) {
          return local;
        }

        // Otherwise use server and update local cache
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${slug}`, JSON.stringify(serverItem));
        } catch {}
        return serverItem;
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote history:", err);
  }

  return local;
}
