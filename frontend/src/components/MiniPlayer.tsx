import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Headphones, Compass } from "lucide-react";
import type { ChapterCue } from "../data/api";
import { useAuth } from "../context/AuthContext";

interface MiniPlayerProps {
  storyTitle: string;
  chapterTitle: string;
  audioSrc?: string;
  cues?: ChapterCue[];
  activeCue?: ChapterCue | null;
  onTimeUpdate: (curTime: number, duration: number) => void;
  seekRef: React.MutableRefObject<((time: number) => void) | null>;
  prevLink?: string | null;
  nextLink?: string | null;
  audioPageLink: string;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  onScrollToActiveCue: () => void;
  onEnded?: () => void;
  initialAutoPlay?: boolean;
  initialTime?: number;
}

export function MiniPlayer({
  storyTitle,
  chapterTitle,
  audioSrc,
  activeCue,
  onTimeUpdate,
  seekRef,
  prevLink,
  nextLink,
  audioPageLink,
  autoScroll,
  onToggleAutoScroll,
  onScrollToActiveCue,
  onEnded,
  initialAutoPlay = false,
  initialTime = 0,
}: MiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { preferences, updatePreferences } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const hasSeekedInitialRef = useRef(false);
  const [speed, setSpeed] = useState(() => {
    return preferences.playbackSpeed || localStorage.getItem("webtruyen_audio_speed") || "1";
  });

  // Sync when remote preferences arrive
  useEffect(() => {
    if (preferences.playbackSpeed && preferences.playbackSpeed !== speed) {
      setSpeed(preferences.playbackSpeed);
      localStorage.setItem("webtruyen_audio_speed", preferences.playbackSpeed);
    }
  }, [preferences.playbackSpeed]);

  // Keep audio playbackRate in sync with speed state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(speed);
    }
  }, [speed]);

  useEffect(() => {
    hasSeekedInitialRef.current = false;
    const initSec = initialTime && initialTime > 0 ? initialTime : 0;
    setCurrentTime(initSec);
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(speed);
    }
    if (initialAutoPlay && audioSrc) {
      const audio = audioRef.current;
      if (audio) {
        const startPlay = () => {
          if (!hasSeekedInitialRef.current && initSec > 0) {
            try {
              audio.currentTime = initSec;
              hasSeekedInitialRef.current = true;
            } catch (err) {}
          }
          audio.playbackRate = Number(speed);
          audio
            .play()
            .then(() => {
              if (audioRef.current) {
                audioRef.current.playbackRate = Number(speed);
              }
              setPlaying(true);
            })
            .catch(() => {});
        };
        if (audio.readyState >= 2) {
          startPlay();
        } else {
          audio.addEventListener("canplay", startPlay, { once: true });
        }
      }
    } else {
      setPlaying(false);
    }
  }, [audioSrc, initialAutoPlay, initialTime, speed]);

  useEffect(() => {
    seekRef.current = (time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        audioRef.current
          .play()
          .then(() => setPlaying(true))
          .catch(() => {});
      }
    };
    return () => {
      seekRef.current = null;
    };
  }, [seekRef]);

  function togglePlay() {
    if (!audioRef.current || !audioSrc) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.playbackRate = Number(speed);
      }
      audioRef.current
        .play()
        .then(() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = Number(speed);
          }
          setPlaying(true);
        })
        .catch((err) => {
          console.warn("Audio play error:", err);
          setPlaying(false);
        });
    }
  }

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);
    onTimeUpdate(cur, dur);
  }

  function handleSeekRelative(delta: number) {
    if (!audioRef.current) return;
    const next = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = next;
  }

  function handleSpeedChange(newSpeed: string) {
    setSpeed(newSpeed);
    localStorage.setItem("webtruyen_audio_speed", newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(newSpeed);
    }
    updatePreferences({ playbackSpeed: newSpeed });
  }

  function formatTime(sec: number) {
    if (!Number.isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  if (!audioSrc) return null;

  return (
    <aside className="mini-player-bar" aria-label="Trình phát audio đồng bộ karaoke">
      {/* Top progress indicator */}
      <div
        className="mini-progress-line"
        style={{ width: `${progressPct}%` }}
        aria-hidden="true"
      />

      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          el.playbackRate = Number(speed);
          if (!hasSeekedInitialRef.current && initialTime && initialTime > 0) {
            try {
              el.currentTime = initialTime;
              hasSeekedInitialRef.current = true;
              setCurrentTime(initialTime);
            } catch (err) {}
          }
          handleTimeUpdate();
        }}
        onCanPlay={(e) => {
          const el = e.currentTarget;
          el.playbackRate = Number(speed);
          if (!hasSeekedInitialRef.current && initialTime && initialTime > 0) {
            try {
              el.currentTime = initialTime;
              hasSeekedInitialRef.current = true;
              setCurrentTime(initialTime);
            } catch (err) {}
          }
        }}
        onPlay={(e) => {
          e.currentTarget.playbackRate = Number(speed);
        }}
        onPlaying={(e) => {
          e.currentTarget.playbackRate = Number(speed);
        }}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
      />

      {/* Left info - Click to jump to active cue */}
      <div
        className="mini-player-info"
        onClick={onScrollToActiveCue}
        title="Nhấp để cuộn đến câu đang đọc"
      >
        <span className="mini-player-title">
          {chapterTitle} · {storyTitle}
        </span>
        <span className="mini-player-cue">
          {activeCue ? `✨ ${activeCue.text}` : "Nhấp câu bất kỳ để nghe audio đồng bộ..."}
        </span>
      </div>

      {/* Center controls */}
      <div className="mini-player-controls">
        {prevLink ? (
          <Link to={prevLink} state={{ autoPlay: playing }} className="mini-control-btn" title="Chương trước">
            <Icon icon={SkipBack} size={18} />
          </Link>
        ) : (
          <button type="button" className="mini-control-btn" disabled title="Đang ở chương đầu">
            <Icon icon={SkipBack} size={18} />
          </button>
        )}

        <button
          type="button"
          className="mini-control-btn"
          onClick={() => handleSeekRelative(-10)}
          title="Tua lùi 10 giây"
        >
          <Icon icon={RotateCcw} size={17} />
        </button>

        <button
          type="button"
          className="mini-play-btn"
          onClick={togglePlay}
          aria-label={playing ? "Tạm dừng audio" : "Phát audio karaoke"}
        >
          <Icon icon={playing ? Pause : Play} size={20} />
        </button>

        <button
          type="button"
          className="mini-control-btn"
          onClick={() => handleSeekRelative(10)}
          title="Tua tới 10 giây"
        >
          <Icon icon={RotateCw} size={17} />
        </button>

        {nextLink ? (
          <Link to={nextLink} state={{ autoPlay: playing }} className="mini-control-btn" title="Chương sau">
            <Icon icon={SkipForward} size={18} />
          </Link>
        ) : (
          <button type="button" className="mini-control-btn" disabled title="Đang ở chương cuối">
            <Icon icon={SkipForward} size={18} />
          </button>
        )}

        <span className="mini-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Right actions */}
      <div className="mini-player-actions">
        <button
          type="button"
          className={`mini-action-btn ${autoScroll ? "active" : ""}`}
          onClick={onToggleAutoScroll}
          title={autoScroll ? "Tắt tự động cuộn theo câu đọc" : "Bật tự động cuộn theo câu đọc"}
        >
          <Icon icon={Compass} size={15} />
          <span className="mini-action-text">{autoScroll ? "Cuộn: Bật" : "Cuộn: Tắt"}</span>
        </button>

        <select
          className="mini-action-btn"
          value={speed}
          onChange={(e) => handleSpeedChange(e.target.value)}
          aria-label="Tốc độ đọc"
        >
          <option value="0.75">0.75×</option>
          <option value="1">1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>

        <Link
          to={audioPageLink}
          className="mini-action-btn"
          title="Chuyển sang giao diện nghe audio chuyên sâu"
        >
          <Icon icon={Headphones} size={15} />
          <span className="mini-action-text">Máy đĩa than</span>
        </Link>
      </div>
    </aside>
  );
}
