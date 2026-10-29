import { getChapterContent } from "./api";
import {
  saveAudioToDevice,
  getAudioFromDevice,
  getActiveBlobUrlSync,
} from "./audioStorage";

const preloadedSet = new Set<string>();
const audioWarmupPool = new Map<string, HTMLAudioElement>();

/**
 * Preloads and saves 100% of the next chapter's text/cues and full audio file
 * directly onto the user's device (phone/PC) to guarantee zero-latency,
 * gapless chapter transitions even under weak network or offline conditions.
 */
export async function preloadNextChapter(
  slug: string,
  chapterId: string,
  voice?: string
): Promise<void> {
  if (!slug || !chapterId) return;

  const key = `${slug}:${chapterId}:${voice || ""}`;
  if (preloadedSet.has(key)) return;
  preloadedSet.add(key);

  const targetAudioUrl = `/api/books/${slug}/audio/${chapterId}${
    voice ? `?voice=${encodeURIComponent(voice)}` : ""
  }`;

  try {
    // 1. Download & persist full chapter JSON (text, cues, title) to local storage
    getChapterContent(slug, chapterId, voice).catch(() => {});

    // 2. Download 100% of the audio file to device storage (IndexedDB + Blob URL)
    if (typeof fetch === "function") {
      fetch(targetAudioUrl)
        .then(async (res) => {
          if (!res.ok) return;
          const blob = await res.blob();
          const blobUrl = await saveAudioToDevice(targetAudioUrl, blob);

          // 3. Keep a warm HTML5 Audio object with the local Blob URL
          if (typeof Audio !== "undefined" && blobUrl) {
            let audio = audioWarmupPool.get(targetAudioUrl);
            if (!audio) {
              audio = new Audio();
              audio.preload = "auto";
              audio.muted = true;
              audio.src = blobUrl;
              audio.load();
              audioWarmupPool.set(targetAudioUrl, audio);
            }

            if (audioWarmupPool.size > 3) {
              const oldestKey = audioWarmupPool.keys().next().value;
              if (oldestKey) {
                const oldAudio = audioWarmupPool.get(oldestKey);
                if (oldAudio) {
                  oldAudio.src = "";
                }
                audioWarmupPool.delete(oldestKey);
              }
            }
          }
        })
        .catch((err) => {
          console.debug("Audio full download error:", err);
        });
    }
  } catch (err) {
    console.debug("Preload error:", err);
  }
}

/**
 * Resolves an audio URL to a locally cached Blob URL if available on the device,
 * or falls back to the original network URL.
 */
export async function resolveAudioUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("blob:")) return url;

  // 1. Check RAM memory pool (0ms)
  const syncBlobUrl = getActiveBlobUrlSync(url);
  if (syncBlobUrl) return syncBlobUrl;

  // 2. Check IndexedDB persistent device storage
  try {
    const deviceBlobUrl = await getAudioFromDevice(url);
    if (deviceBlobUrl) return deviceBlobUrl;
  } catch (err) {
    console.debug("Could not read audio from device:", err);
  }

  return url;
}

/**
 * Synchronous resolver: returns active Blob URL from RAM if already loaded, else original url.
 */
export function resolveAudioUrlSync(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("blob:")) return url;
  return getActiveBlobUrlSync(url) || url;
}
