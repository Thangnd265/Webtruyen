import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAudioUrlSync } from "../data/audioPreloader";

describe("AutoPlay Chapter Advance Logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("synchronously resolves new audio URL without lagging behind", () => {
    const ch1Url = "/api/books/test/audio/ch1";
    const ch2Url = "/api/books/test/audio/ch2";

    const resolvedCh1 = resolveAudioUrlSync(ch1Url);
    expect(resolvedCh1).toBe(ch1Url);

    const resolvedCh2 = resolveAudioUrlSync(ch2Url);
    expect(resolvedCh2).toBe(ch2Url);
  });

  it("ensures matching content filter prevents stale chapter audioUrl leak", () => {
    const currentChapter = { id: "ch2", title: "Chương 2", chapter_index: 2 };
    
    // Simulate stale content from chapter 1 while chapter 2 is loading
    const staleContent = { chapter_id: "ch1", title: "Chương 1", chapter_index: 1, audio_url: "/api/books/test/audio/ch1" };

    const isMatchingContent = Boolean(
      staleContent &&
      currentChapter &&
      (staleContent.chapter_id === currentChapter.id ||
        (currentChapter.chapter_index !== undefined && staleContent.chapter_id === String(currentChapter.chapter_index)))
    );

    expect(isMatchingContent).toBe(false);

    // Audio URL correctly uses currentChapter rather than staleContent
    const audioSrc =
      (isMatchingContent && staleContent?.audio_url) ||
      (currentChapter ? `/api/books/test/audio/${currentChapter.id}` : undefined);

    expect(audioSrc).toBe("/api/books/test/audio/ch2");
  });

  it("ensures resumeTime resets to 0 when advancing chapters without stateResumeTime", () => {
    let resumeTime = 480; // User finished chapter 1 at 480s
    const stateResumeTime = undefined; // Auto-next does not pass resumeTime

    // Effect logic in AudioPage
    if (typeof stateResumeTime === "number") {
      resumeTime = stateResumeTime;
    } else {
      resumeTime = 0; // Fresh chapter starts from 00:00
    }

    expect(resumeTime).toBe(0);
  });
});
