import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  savePlaybackProgress,
  getLocalPlaybackProgress,
  getBestPlaybackProgress,
  type PlaybackProgress,
} from "../data/playbackProgress";

describe("playbackProgress", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("saves progress immediately to localStorage", () => {
    savePlaybackProgress({
      book_slug: "truyen-test",
      book_title: "Truyện Test",
      chapter_id: "ch-1",
      chapter_title: "Chương 1",
      current_time: 125,
      duration: 500,
      progress: 0.25,
    });

    const local = getLocalPlaybackProgress("truyen-test");
    expect(local).not.toBeNull();
    expect(local?.book_slug).toBe("truyen-test");
    expect(local?.chapter_id).toBe("ch-1");
    expect(local?.current_time).toBe(125);
    expect(local?.duration).toBe(500);
    expect(local?.progress).toBe(0.25);
    expect(typeof local?.updated_at).toBe("number");
    expect(local?.updated_at).toBeGreaterThan(0);
  });

  it("syncs to server when token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    savePlaybackProgress(
      {
        book_slug: "truyen-sync",
        book_title: "Truyện Sync",
        chapter_id: "ch-2",
        chapter_title: "Chương 2",
        current_time: 200,
        duration: 400,
        progress: 0.5,
      },
      "fake-token-123",
      { keepalive: true }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/history",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fake-token-123",
        }),
        keepalive: true,
      })
    );
  });

  it("returns newer local progress when local timestamp is newer than server", async () => {
    const now = Date.now();
    const localItem: PlaybackProgress = {
      book_slug: "truyen-arbitration",
      book_title: "Truyện",
      chapter_id: "ch-5",
      chapter_title: "Chương 5",
      current_time: 300,
      duration: 600,
      progress: 0.5,
      updated_at: now, // newer
    };
    localStorage.setItem("webtruyen_audio_progress_truyen-arbitration", JSON.stringify(localItem));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        book_slug: "truyen-arbitration",
        chapter_id: "ch-4",
        current_time: 150,
        duration: 600,
        updated_at: new Date(now - 100000).toISOString(), // older
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const best = await getBestPlaybackProgress("truyen-arbitration", "token");
    expect(best?.chapter_id).toBe("ch-5");
    expect(best?.current_time).toBe(300);
  });

  it("returns server progress and updates local storage when server timestamp is newer", async () => {
    const now = Date.now();
    const localItem: PlaybackProgress = {
      book_slug: "truyen-arbitration-2",
      book_title: "Truyện",
      chapter_id: "ch-1",
      chapter_title: "Chương 1",
      current_time: 50,
      duration: 500,
      progress: 0.1,
      updated_at: now - 50000, // older
    };
    localStorage.setItem("webtruyen_audio_progress_truyen-arbitration-2", JSON.stringify(localItem));

    const serverDate = new Date(now + 10000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        book_slug: "truyen-arbitration-2",
        book_title: "Truyện",
        chapter_id: "ch-2",
        chapter_title: "Chương 2",
        current_time: 250,
        duration: 500,
        updated_at: serverDate, // newer (from another device)
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const best = await getBestPlaybackProgress("truyen-arbitration-2", "token");
    expect(best?.chapter_id).toBe("ch-2");
    expect(best?.current_time).toBe(250);

    // Also check that local storage was updated with the newer server progress
    const updatedLocal = getLocalPlaybackProgress("truyen-arbitration-2");
    expect(updatedLocal?.chapter_id).toBe("ch-2");
    expect(updatedLocal?.current_time).toBe(250);
  });
});
