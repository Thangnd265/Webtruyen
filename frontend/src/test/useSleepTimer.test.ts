import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSleepTimer } from "../hooks/useSleepTimer";

describe("useSleepTimer hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with 'off' mode and null remaining seconds", () => {
    const onTriggerStop = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onTriggerStop }));

    expect(result.current.timerMode).toBe("off");
    expect(result.current.remainingSeconds).toBeNull();
    expect(result.current.badgeText).toBe("");
  });

  it("sets timer mode to 15 minutes and formats remaining time", () => {
    const onTriggerStop = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onTriggerStop }));

    act(() => {
      result.current.setTimerMode("15");
    });

    expect(result.current.timerMode).toBe("15");
    expect(result.current.remainingSeconds).toBe(900);
    expect(result.current.badgeText).toBe("15:00");

    // Advance 60 seconds
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current.remainingSeconds).toBe(840);
    expect(result.current.badgeText).toBe("14:00");
  });

  it("triggers onTriggerStop when countdown completes", () => {
    const onTriggerStop = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onTriggerStop }));

    act(() => {
      result.current.setTimerMode("15");
    });

    // Advance 900 seconds (15 minutes)
    act(() => {
      vi.advanceTimersByTime(900000);
    });

    expect(onTriggerStop).toHaveBeenCalledTimes(1);
    expect(result.current.timerMode).toBe("off");
    expect(result.current.remainingSeconds).toBeNull();
  });

  it("handles 'chapter' mode and intercepts chapter end", () => {
    const onTriggerStop = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onTriggerStop }));

    act(() => {
      result.current.setTimerMode("chapter");
    });

    expect(result.current.timerMode).toBe("chapter");
    expect(result.current.badgeText).toBe("Hết chương");

    let intercepted = false;
    act(() => {
      intercepted = result.current.checkChapterEnd();
    });

    expect(intercepted).toBe(true);
    expect(onTriggerStop).toHaveBeenCalledTimes(1);
    expect(result.current.timerMode).toBe("off");
    expect(result.current.badgeText).toBe("");
  });

  it("clears timer when set back to 'off'", () => {
    const onTriggerStop = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onTriggerStop }));

    act(() => {
      result.current.setTimerMode("30");
    });
    expect(result.current.remainingSeconds).toBe(1800);

    act(() => {
      result.current.setTimerMode("off");
    });
    expect(result.current.timerMode).toBe("off");
    expect(result.current.remainingSeconds).toBeNull();
    expect(result.current.badgeText).toBe("");

    // Advance time and ensure no trigger
    act(() => {
      vi.advanceTimersByTime(1800000);
    });
    expect(onTriggerStop).not.toHaveBeenCalled();
  });
});
