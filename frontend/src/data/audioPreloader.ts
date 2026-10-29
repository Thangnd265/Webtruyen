import { getChapterContent } from "./api";

const preloadedSet = new Set<string>();
const audioWarmupPool = new Map<string, HTMLAudioElement>();

/**
 * Preloads both chapter content (text/cues) and audio stream for the next chapter.
 * Works across desktop and mobile devices.
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
    // 1. Preload chapter content JSON (cues, text, title) into API memory cache
    getChapterContent(slug, chapterId, voice).catch(() => {});

    // 2. Pre-warm HTTP cache with Range request for first 1MB of audio (fast, low memory)
    if (typeof fetch === "function") {
      fetch(targetAudioUrl, {
        headers: { Range: "bytes=0-1048576" },
        cache: "force-cache",
      }).catch(() => {});
    }

    // 3. Keep a warm HTML5 Audio object
    if (typeof Audio !== "undefined") {
      let audio = audioWarmupPool.get(targetAudioUrl);
      if (!audio) {
        audio = new Audio();
        audio.preload = "auto";
        audio.muted = true;
        audio.src = targetAudioUrl;
        audio.load();
        audioWarmupPool.set(targetAudioUrl, audio);
      }

      // Bound pool size to 3 items
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
  } catch (err) {
    console.debug("Preload error:", err);
  }
}
