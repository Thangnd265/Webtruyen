import { useState, useEffect, useRef, useCallback } from "react";

export type SleepTimerMode = "off" | "15" | "30" | "45" | "60" | "90" | "chapter";

interface UseSleepTimerOptions {
  onTriggerStop: () => void;
  audioElementRef?: React.RefObject<HTMLAudioElement | null>;
}

export function useSleepTimer({ onTriggerStop, audioElementRef }: UseSleepTimerOptions) {
  const [timerMode, setTimerModeState] = useState<SleepTimerMode>("off");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const targetTimeRef = useRef<number | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to format remaining time into mm:ss
  const formatTimer = useCallback((sec: number | null): string => {
    if (sec === null || sec < 0) return "";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  const badgeText =
    timerMode === "chapter"
      ? "Hết chương"
      : remainingSeconds !== null
      ? formatTimer(remainingSeconds)
      : "";

  // Stop playback with gentle fade-out so user is not startled awake
  const triggerStopWithFade = useCallback(() => {
    const audio = audioElementRef?.current;
    if (audio && !audio.paused && audio.volume > 0.05) {
      const initialVol = audio.volume;
      const step = initialVol / 8;
      fadeIntervalRef.current = setInterval(() => {
        if (!audio || audio.paused || audio.volume <= step) {
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          if (audio) {
            audio.pause();
            audio.volume = initialVol;
          }
          onTriggerStop();
        } else {
          audio.volume = Math.max(0, audio.volume - step);
        }
      }, 150);
    } else {
      if (audio) {
        audio.pause();
      }
      onTriggerStop();
    }
    setTimerModeState("off");
    setRemainingSeconds(null);
    targetTimeRef.current = null;
  }, [audioElementRef, onTriggerStop]);

  // Set timer mode
  const setTimerMode = useCallback((mode: SleepTimerMode) => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    setTimerModeState(mode);

    if (mode === "off") {
      targetTimeRef.current = null;
      setRemainingSeconds(null);
      return;
    }

    if (mode === "chapter") {
      targetTimeRef.current = null;
      setRemainingSeconds(null);
      return;
    }

    const minutes = parseInt(mode, 10);
    if (!Number.isNaN(minutes) && minutes > 0) {
      const totalSec = minutes * 60;
      targetTimeRef.current = Date.now() + totalSec * 1000;
      setRemainingSeconds(totalSec);
    }
  }, []);

  // Interval countdown
  useEffect(() => {
    if (!targetTimeRef.current || timerMode === "off" || timerMode === "chapter") {
      return;
    }

    const timer = setInterval(() => {
      if (!targetTimeRef.current) return;
      const diffSec = Math.round((targetTimeRef.current - Date.now()) / 1000);
      if (diffSec <= 0) {
        clearInterval(timer);
        triggerStopWithFade();
      } else {
        setRemainingSeconds(diffSec);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [timerMode, triggerStopWithFade]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  // Check on chapter end. Returns true if chapter timer intercepted the end
  const checkChapterEnd = useCallback((): boolean => {
    if (timerMode === "chapter") {
      setTimerModeState("off");
      setRemainingSeconds(null);
      targetTimeRef.current = null;
      onTriggerStop();
      return true;
    }
    return false;
  }, [timerMode, onTriggerStop]);

  return {
    timerMode,
    remainingSeconds,
    badgeText,
    setTimerMode,
    checkChapterEnd,
    formatTimer,
  };
}
