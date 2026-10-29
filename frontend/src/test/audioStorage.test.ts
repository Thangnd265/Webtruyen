import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveAudioToDevice,
  getAudioFromDevice,
  getActiveBlobUrlSync,
} from "../data/audioStorage";
import { resolveAudioUrl, resolveAudioUrlSync } from "../data/audioPreloader";

describe("audioStorage & audioPreloader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves audio blob and returns a valid blob URL", async () => {
    const fakeBlob = new Blob(["audio-bytes-content"], { type: "audio/mp3" });
    const url = "/api/books/test/audio/ch1";

    const blobUrl = await saveAudioToDevice(url, fakeBlob);
    expect(blobUrl).toBeDefined();
    expect(blobUrl.startsWith("blob:")).toBe(true);

    // Sync check
    const syncUrl = getActiveBlobUrlSync(url);
    expect(syncUrl).toBe(blobUrl);

    // Async retrieval
    const retrieved = await getAudioFromDevice(url);
    expect(retrieved).toBe(blobUrl);
  });

  it("resolves cached audio URL to blob URL, and uncached to original URL", async () => {
    const fakeBlob = new Blob(["audio-bytes-2"], { type: "audio/mp3" });
    const cachedUrl = "/api/books/test/audio/ch2";
    const uncachedUrl = "/api/books/test/audio/ch99";

    const blobUrl = await saveAudioToDevice(cachedUrl, fakeBlob);

    // Cached resolution
    const resolvedCached = await resolveAudioUrl(cachedUrl);
    expect(resolvedCached).toBe(blobUrl);
    expect(resolveAudioUrlSync(cachedUrl)).toBe(blobUrl);

    // Uncached resolution
    const resolvedUncached = await resolveAudioUrl(uncachedUrl);
    expect(resolvedUncached).toBe(uncachedUrl);
    expect(resolveAudioUrlSync(uncachedUrl)).toBe(uncachedUrl);
  });

  it("enforces LRU cache limit of 3 audio files", async () => {
    const blob1 = new Blob(["1"], { type: "audio/mp3" });
    const blob2 = new Blob(["2"], { type: "audio/mp3" });
    const blob3 = new Blob(["3"], { type: "audio/mp3" });
    const blob4 = new Blob(["4"], { type: "audio/mp3" });

    await saveAudioToDevice("/api/audio/1", blob1);
    await saveAudioToDevice("/api/audio/2", blob2);
    await saveAudioToDevice("/api/audio/3", blob3);
    // 4th item triggers eviction of 1st
    await saveAudioToDevice("/api/audio/4", blob4);

    expect(getActiveBlobUrlSync("/api/audio/4")).toBeDefined();
    expect(getActiveBlobUrlSync("/api/audio/3")).toBeDefined();
    expect(getActiveBlobUrlSync("/api/audio/2")).toBeDefined();
    // 1 should have been evicted
    expect(getActiveBlobUrlSync("/api/audio/1")).toBeNull();
  });
});
