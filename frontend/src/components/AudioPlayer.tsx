import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { AudioLoader } from "./AudioLoader";
import { VinylTurntable } from "./VinylTurntable";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Timer,
  RotateCcw,
  RotateCw,
  Search,
  Headphones,
  BookOpen,
  List,
  X,
} from "lucide-react";
import { preloadChapter, type BackendChapter } from "../data/api";
import { useAuth } from "../context/AuthContext";
import { useSleepTimer, type SleepTimerMode } from "../hooks/useSleepTimer";
import { savePlaybackProgress } from "../data/playbackProgress";
import { preloadNextChapter, resolveAudioUrl, resolveAudioUrlSync } from "../data/audioPreloader";

export function AudioPlayer({
  storyPath,
  chapterIndex,
  chapters,
  audioSrc,
  locked = false,
  storyTitle = "",
  coverUrl,
  initialAutoPlay = false,
  initialTime = 0,
  currentVoice,
  chapterTitle = "",
  docLink = "",
  author = "",
}: {
  storyPath: string;
  chapterIndex: number;
  chapters: BackendChapter[];
  audioSrc?: string;
  locked?: boolean;
  storyTitle?: string;
  coverUrl?: string;
  initialAutoPlay?: boolean;
  initialTime?: number;
  currentVoice?: string;
  chapterTitle?: string;
  docLink?: string;
  author?: string;
}) {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { token, preferences, updatePreferences } = useAuth();
  const lastSyncRef = useRef<number>(0);
  const hasSeekedInitialRef = useRef<boolean>(false);
  const preloadedChapterRef = useRef<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(() => {
    return preferences.playbackSpeed || localStorage.getItem("webtruyen_audio_speed") || "1";
  });
  const [volume, setVolume] = useState(80);
  const [audioError, setAudioError] = useState(false);
  const [deviceSrc, setDeviceSrc] = useState<string | undefined>(undefined);
  const syncSrc = useMemo(() => resolveAudioUrlSync(audioSrc) || audioSrc, [audioSrc]);

  useEffect(() => {
    let active = true;
    if (!audioSrc) {
      setDeviceSrc(undefined);
      return;
    }
    setDeviceSrc(undefined);
    resolveAudioUrl(audioSrc).then((deviceUrl) => {
      if (active && deviceUrl && deviceUrl !== syncSrc) {
        setDeviceSrc(deviceUrl);
      }
    });

    return () => {
      active = false;
    };
  }, [audioSrc, syncSrc]);

  const activeSrc = deviceSrc || syncSrc;
  const shouldAutoPlayRef = useRef<boolean>(initialAutoPlay);

  const attemptAutoPlay = useCallback(
    (el?: HTMLAudioElement | null) => {
      const audio = el || audioRef.current;
      if (!audio || !shouldAutoPlayRef.current || locked) return;
      shouldAutoPlayRef.current = false;
      setBuffering(true);
      audio.playbackRate = Number(speed);
      audio
        .play()
        .then(() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = Number(speed);
          }
          setPlaying(true);
          setBuffering(false);
        })
        .catch((err) => {
          console.warn("AutoPlay blocked or deferred:", err);
          setBuffering(false);
          setPlaying(false);
        });
    },
    [speed, locked]
  );

  const [autoNext, setAutoNext] = useState(() => {
    if (preferences.autoNext !== undefined) return preferences.autoNext;
    const saved = localStorage.getItem("webtruyen_auto_next");
    return saved !== null ? saved === "true" : true;
  });

  // Sync speed when remote preferences arrive
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

  const totalChapters = Math.max(chapters.length, 1);
  const currentChapter = chapters[chapterIndex] || {
    id: String(chapterIndex + 1),
    title: `Chương ${chapterIndex + 1}`,
  };

  const [chapterSearch, setChapterSearch] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const activeChapterItemRef = useRef<HTMLButtonElement | null>(null);

  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return chapters;
    const q = chapterSearch.toLowerCase().trim();
    return chapters.filter((c, i) => {
      const titleMatch = (c.title || "").toLowerCase().includes(q);
      const indexMatch = String(c.chapter_index !== undefined ? c.chapter_index : i + 1).includes(q);
      return titleMatch || indexMatch;
    });
  }, [chapters, chapterSearch]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  useEffect(() => {
    if (isDrawerOpen && activeChapterItemRef.current) {
      activeChapterItemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isDrawerOpen, chapterIndex]);

  function seekRelative(delta: number) {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration || duration || 0;
    const next = Math.max(0, Math.min(dur, audioRef.current.currentTime + delta));
    handleSeek(dur > 0 ? (next / dur) * 100 : 0);
  }

  useEffect(() => {
    hasSeekedInitialRef.current = false;
    preloadedChapterRef.current = null;
    const initSec = initialTime && initialTime > 0 ? initialTime : 0;
    setCurrentTime(initSec);
    setPosition(0);
    setAudioError(false);

    if (audioRef.current) {
      audioRef.current.playbackRate = Number(speed);
      audioRef.current.volume = volume / 100;
      try {
        audioRef.current.currentTime = initSec;
        hasSeekedInitialRef.current = initSec > 0;
      } catch (err) {}
    }

    if (initialAutoPlay && audioSrc && !locked) {
      shouldAutoPlayRef.current = true;
      setBuffering(true);
      const audio = audioRef.current;
      if (audio) {
        // If element is already loaded with this exact active source
        const currentSrc = audio.currentSrc || audio.src;
        const matches = currentSrc && (currentSrc.endsWith(audioSrc) || currentSrc === activeSrc);
        if (matches && audio.readyState >= 2) {
          attemptAutoPlay(audio);
        }
      }
    } else {
      shouldAutoPlayRef.current = false;
      setPlaying(false);
      setBuffering(false);
    }
  }, [activeSrc, audioSrc, chapterIndex, initialAutoPlay, initialTime, speed, locked, attemptAutoPlay]);

  // Ensure late-arriving initialTime (e.g. from async API history) properly seeks the audio
  useEffect(() => {
    if (initialTime && initialTime > 0 && !hasSeekedInitialRef.current && audioRef.current) {
      try {
        audioRef.current.currentTime = initialTime;
        hasSeekedInitialRef.current = true;
        setCurrentTime(initialTime);
        if (audioRef.current.duration > 0) {
          setPosition(Math.round((initialTime / audioRef.current.duration) * 100));
        }
      } catch (err) {}
    }
  }, [initialTime]);

  const syncProgress = useCallback(
    (curTime: number, dur: number, force = false, keepalive = false) => {
      const now = Date.now();
      if (!force && now - lastSyncRef.current < 4000) return;
      lastSyncRef.current = now;

      const slug = storyPath.replace(/^\/truyen\//, "").replace(/\/.*$/, "");
      const ch = chapters[chapterIndex];
      if (!slug || !ch) return;

      savePlaybackProgress(
        {
          book_slug: slug,
          book_title: storyTitle || slug,
          book_author: "",
          book_cover: coverUrl || "",
          chapter_id: ch.id,
          chapter_title: ch.title,
          current_time: curTime,
          duration: dur,
          progress: dur > 0 ? Number((curTime / dur).toFixed(4)) : 0,
        },
        token,
        { keepalive }
      );
    },
    [token, storyPath, chapters, chapterIndex, storyTitle, coverUrl]
  );

  // Sync on tab close, page refresh, app switch, or phone lock
  useEffect(() => {
    const handleSave = () => {
      if (audioRef.current) {
        syncProgress(audioRef.current.currentTime, audioRef.current.duration || 0, true, true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleSave();
      }
    };

    window.addEventListener("pagehide", handleSave);
    window.addEventListener("beforeunload", handleSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      handleSave();
      window.removeEventListener("pagehide", handleSave);
      window.removeEventListener("beforeunload", handleSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncProgress]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlaying(false);
    if (audioRef.current) {
      syncProgress(audioRef.current.currentTime, audioRef.current.duration || 0, true);
    }
  }, [syncProgress]);

  const {
    timerMode: sleepTimerMode,
    badgeText: sleepTimerBadge,
    setTimerMode: setSleepTimerMode,
    checkChapterEnd,
  } = useSleepTimer({
    onTriggerStop: stopPlayback,
    audioElementRef: audioRef,
  });

  function togglePlay() {
    if (!audioRef.current || locked) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      syncProgress(currentTime, duration, true);
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
          console.warn("Audio playback failed:", err);
          setAudioError(true);
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
    if (dur > 0) {
      setPosition(Math.round((cur / dur) * 100));
    }
    syncProgress(cur, dur, false);

    // Smart Gapless Preload: Preload next chapter earlier (progress >= 60% or remaining <= 45s)
    if (dur > 0 && chapterIndex < chapters.length - 1) {
      const remaining = dur - cur;
      const progress = cur / dur;
      const nextChapter = chapters[chapterIndex + 1];
      if (nextChapter && (remaining <= 45 || progress >= 0.6) && preloadedChapterRef.current !== nextChapter.id) {
        preloadedChapterRef.current = nextChapter.id;
        const slug = storyPath.replace(/^\/truyen\//, "").replace(/\/.*$/, "");
        preloadNextChapter(slug, nextChapter.id, currentVoice);
      }
    }
  }

  function handleSeek(val: number) {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration || 0;
    setPosition(val);
    if (dur > 0) {
      const targetTime = (val / 100) * dur;
      audioRef.current.currentTime = targetTime;
      syncProgress(targetTime, dur, true);
    }
  }

  function handleSpeedChange(newSpeed: string) {
    setSpeed(newSpeed);
    localStorage.setItem("webtruyen_audio_speed", newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(newSpeed);
    }
    updatePreferences({ playbackSpeed: newSpeed });
  }

  function handleVolumeChange(val: number) {
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val / 100;
    }
  }

  function selectChapter(idx: number, continuePlaying = playing) {
    if (idx < 0 || idx >= chapters.length) return;
    const target = chapters[idx];
    const query = currentVoice ? `?voice=${encodeURIComponent(currentVoice)}` : "";
    navigate(`${storyPath}/nghe/${target ? target.id : idx + 1}${query}`, {
      state: { autoPlay: continuePlaying },
    });
  }

  function formatTime(sec: number) {
    if (!Number.isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="audio-focus-sanctuary">
      {/* Centered Main Player Deck */}
      <div className="audio-focus-deck">
        {/* Chapter Title Badge & Heading */}
        <div className="audio-chapter-meta">
          <div className="audio-eyebrow-row">
            <span className="audio-eyebrow">
              {currentChapter.chapter_index !== undefined && currentChapter.chapter_index !== 0
                ? `CHƯƠNG ${currentChapter.chapter_index}`
                : "AUDIOBOOK"}
            </span>
            {storyTitle && <span className="audio-story-tag">{storyTitle}</span>}
          </div>
          <h1 className="audio-chapter-heading">
            {chapterTitle || currentChapter.title || `Chương ${chapterIndex + 1}`}
          </h1>
          {author && (
            <p className="audio-author-line">
              Tác giả: <strong>{author}</strong>
            </p>
          )}
        </div>

        {/* Vinyl Turntable Plinth */}
        <div className="turntable-stage-wrapper">
          <VinylTurntable
            playing={playing && !buffering}
            onTogglePlay={togglePlay}
            coverUrl={coverUrl}
            title={storyTitle || currentChapter.title}
            progress={duration > 0 ? currentTime / duration : 0}
            disabled={locked || !audioSrc}
          />
        </div>

        {/* Audio Element */}
        {audioSrc && (
          <audio
            ref={audioRef}
            src={activeSrc}
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              el.playbackRate = Number(speed);
              const dur = el.duration || 0;
              setDuration(dur);
              if (!hasSeekedInitialRef.current && initialTime && initialTime > 0) {
                try {
                  el.currentTime = initialTime;
                  hasSeekedInitialRef.current = true;
                  setCurrentTime(initialTime);
                  if (dur > 0) {
                    setPosition(Math.round((initialTime / dur) * 100));
                  }
                } catch (err) {}
              }
              handleTimeUpdate();
              if (el.readyState >= 2) {
                attemptAutoPlay(el);
              }
            }}
            onCanPlay={(e) => {
              const el = e.currentTarget;
              el.playbackRate = Number(speed);
              if (!hasSeekedInitialRef.current && initialTime && initialTime > 0) {
                try {
                  el.currentTime = initialTime;
                  hasSeekedInitialRef.current = true;
                  setCurrentTime(initialTime);
                  const dur = el.duration || 0;
                  if (dur > 0) {
                    setPosition(Math.round((initialTime / dur) * 100));
                  }
                } catch (err) {}
              }
              setBuffering(false);
              attemptAutoPlay(el);
            }}
            onPlay={(e) => {
              e.currentTarget.playbackRate = Number(speed);
            }}
            onPlaying={(e) => {
              e.currentTarget.playbackRate = Number(speed);
              setBuffering(false);
            }}
            onWaiting={() => setBuffering(true)}
            onEnded={() => {
              setBuffering(false);
              if (audioRef.current) {
                syncProgress(audioRef.current.duration || 0, audioRef.current.duration || 0, true);
              }
              if (checkChapterEnd()) {
                return;
              }
              if (autoNext && chapterIndex < chapters.length - 1) {
                selectChapter(chapterIndex + 1, true);
              } else {
                setPlaying(false);
              }
            }}
            onError={() => {
              setAudioError(true);
              setBuffering(false);
            }}
          />
        )}

        {buffering && !audioError && !locked && (
          <AudioLoader compact text="Đang tải dữ liệu âm thanh..." />
        )}

        {/* State Indicator */}
        <div className="audio-status-row" role="status" aria-label="Trạng thái phát">
          <span className={`status-indicator-dot ${playing && !buffering ? "is-active" : ""}`} />
          <span className="status-indicator-text">
            {locked
              ? "Chương audio đang được khóa."
              : audioError
              ? "Chương này chưa có file âm thanh sẵn sàng trên server."
              : playing
              ? `Đang phát (${formatTime(currentTime)} / ${formatTime(duration)})`
              : duration > 0
              ? currentTime > 0
                ? `Tiếp tục nghe từ ${formatTime(currentTime)} / ${formatTime(duration)}`
                : `Sẵn sàng phát (${formatTime(duration)})`
              : "Sẵn sàng nghe truyện"}
          </span>
        </div>

        {/* Transport Controls Deck */}
        <div className="audio-transport-deck">
          <button
            type="button"
            className="transport-btn skip-btn"
            aria-label="Chương trước"
            title="Chương trước"
            disabled={chapterIndex === 0}
            onClick={() => selectChapter(chapterIndex - 1, playing)}
          >
            <Icon icon={SkipBack} size={20} />
          </button>

          <button
            type="button"
            className="transport-btn seek-btn"
            aria-label="Lùi lại 10 giây"
            title="Lùi lại 10 giây"
            disabled={locked || !audioSrc}
            onClick={() => seekRelative(-10)}
          >
            <Icon icon={RotateCcw} size={18} />
            <span className="seek-seconds">10</span>
          </button>

          <button
            type="button"
            className={`hero-play-button ${playing && !locked ? "is-playing" : ""}`}
            disabled={locked}
            aria-label={playing ? "Tạm dừng" : "Phát"}
            aria-pressed={playing && !locked}
            onClick={togglePlay}
          >
            <Icon icon={playing && !locked ? Pause : Play} size={28} />
          </button>

          <button
            type="button"
            className="transport-btn seek-btn"
            aria-label="Tiến lên 10 giây"
            title="Tiến lên 10 giây"
            disabled={locked || !audioSrc}
            onClick={() => seekRelative(10)}
          >
            <Icon icon={RotateCw} size={18} />
            <span className="seek-seconds">10</span>
          </button>

          <button
            type="button"
            className="transport-btn skip-btn"
            aria-label="Chương sau"
            title="Chương sau"
            disabled={chapterIndex >= chapters.length - 1}
            onClick={() => selectChapter(chapterIndex + 1, playing)}
          >
            <Icon icon={SkipForward} size={20} />
          </button>
        </div>

        {/* Progress Scrubber */}
        <div className="audio-scrubber-container">
          <div className="scrubber-time-row">
            <span className="time-cur">{formatTime(currentTime)}</span>
            <span className="time-percent">{position}%</span>
            <span className="time-dur">{duration > 0 ? formatTime(duration) : "--:--"}</span>
          </div>
          <input
            type="range"
            className="audio-scrubber-slider"
            min="0"
            max="100"
            step="0.1"
            disabled={locked || duration === 0}
            value={position}
            onChange={(e) => handleSeek(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--color-accent) ${position}%, rgba(255, 255, 255, 0.12) ${position}%)`,
            }}
            aria-label="Tiến độ phát chương"
          />
        </div>

        {/* Utility Controls Bar */}
        <div className="audio-utility-bar">
          {/* Speed Pills */}
          <div className="utility-group utility-speed">
            <span className="utility-caption">Tốc độ:</span>
            <div className="speed-pill-group">
              {["0.75", "1", "1.25", "1.5", "2"].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`speed-pill-btn ${speed === s ? "is-active" : ""}`}
                  onClick={() => handleSpeedChange(s)}
                  disabled={locked}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Volume Control */}
          <div className="utility-group utility-volume">
            <button
              type="button"
              className="volume-icon-btn"
              onClick={() => handleVolumeChange(volume > 0 ? 0 : 80)}
              title={volume > 0 ? "Tắt tiếng" : "Bật tiếng"}
            >
              <Icon icon={volume === 0 ? VolumeX : Volume2} size={18} />
            </button>
            <input
              type="range"
              min="0"
              max="100"
              disabled={locked}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="volume-slider-input"
              style={{
                background: `linear-gradient(to right, var(--color-accent) ${volume}%, rgba(255, 255, 255, 0.12) ${volume}%)`,
              }}
              aria-label="Âm lượng"
            />
            <span className="volume-val">{volume}%</span>
          </div>

          {/* Sleep Timer */}
          <div className="utility-group utility-timer">
            <Icon icon={Timer} size={16} />
            <select
              disabled={locked}
              value={sleepTimerMode}
              onChange={(e) => setSleepTimerMode(e.target.value as SleepTimerMode)}
              aria-label="Hẹn giờ tắt truyện"
              className="timer-select-dropdown"
            >
              <option value="off">Hẹn giờ: Tắt</option>
              <option value="15">15 phút</option>
              <option value="30">30 phút</option>
              <option value="45">45 phút</option>
              <option value="60">60 phút</option>
              <option value="90">90 phút</option>
              <option value="chapter">Hết chương này</option>
            </select>
            {sleepTimerBadge && (
              <span className="sleep-timer-badge" role="timer" aria-live="polite">
                ⏱️ {sleepTimerBadge}
              </span>
            )}
          </div>

          {/* Auto Next */}
          <label className="utility-group utility-autonext" title="Tự động phát chương tiếp theo khi nghe hết">
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => {
                const val = e.target.checked;
                setAutoNext(val);
                localStorage.setItem("webtruyen_auto_next", String(val));
                updatePreferences({ autoNext: val });
              }}
              className="autonext-checkbox"
            />
            <span>Tự chuyển chương</span>
          </label>
        </div>

        {/* Action Buttons Row: Drawer Toggle & Reader Link */}
        <div className="audio-actions-row">
          <button
            type="button"
            className={`action-btn-drawer ${isDrawerOpen ? "is-active" : ""}`}
            onClick={() => setIsDrawerOpen(true)}
            aria-expanded={isDrawerOpen}
            aria-controls="chapter-drawer"
            title="Mở danh sách toàn bộ các chương"
          >
            <Icon icon={List} size={18} />
            <span>Danh sách chương</span>
            <span className="action-btn-counter">
              {chapterIndex + 1} / {chapters.length}
            </span>
          </button>

          {docLink && (
            <Link className="action-btn-reader" to={docLink} title="Chuyển sang bản chữ đọc đồng bộ Karaoke">
              <Icon icon={BookOpen} size={18} />
              <span>Đọc bản chữ & Karaoke</span>
            </Link>
          )}
        </div>
      </div>

      {/* Slide-Over Chapter Drawer Backdrop */}
      <div
        className={`chapter-drawer-backdrop ${isDrawerOpen ? "is-visible" : ""}`}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden={!isDrawerOpen}
      />

      {/* Slide-Over Chapter Drawer Panel */}
      <aside
        id="chapter-drawer"
        className={`chapter-drawer-panel ${isDrawerOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Danh sách chương truyện"
      >
        <div className="drawer-header">
          <div className="drawer-drag-pill" aria-hidden="true" />
          <div className="drawer-title-row">
            <div className="drawer-title-wrap">
              <Icon icon={List} size={18} className="drawer-header-icon" />
              <h3>Danh sách chương</h3>
              <span className="drawer-badge">{chapters.length} chương</span>
            </div>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Đóng danh sách chương"
              title="Đóng"
            >
              <Icon icon={X} size={20} />
            </button>
          </div>

          <div className="drawer-search-wrap">
            <Icon icon={Search} size={15} className="drawer-search-icon" />
            <input
              type="text"
              className="drawer-search-input"
              placeholder="Tìm theo số chương hoặc tên..."
              value={chapterSearch}
              onChange={(e) => setChapterSearch(e.target.value)}
            />
            {chapterSearch && (
              <button
                type="button"
                className="drawer-search-clear"
                onClick={() => setChapterSearch("")}
                aria-label="Xóa tìm kiếm"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="drawer-items-scroll">
          {filteredChapters.length === 0 ? (
            <div className="drawer-empty">Không tìm thấy chương phù hợp</div>
          ) : (
            filteredChapters.map((ch) => {
              const absIdx = chapters.findIndex((c) => c.id === ch.id);
              const isCurrent = absIdx === chapterIndex;
              return (
                <button
                  key={ch.id || absIdx}
                  ref={isCurrent ? activeChapterItemRef : null}
                  type="button"
                  className={`drawer-item-btn ${isCurrent ? "is-active" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => selectChapter(absIdx, true)}
                >
                  <div className="drawer-item-left">
                    {isCurrent ? (
                      <div className="soundwave-equalizer" title="Đang phát" aria-hidden="true">
                        <span className={`soundwave-bar ${playing && !buffering ? "is-animating" : ""}`} />
                        <span className={`soundwave-bar ${playing && !buffering ? "is-animating" : ""}`} />
                        <span className={`soundwave-bar ${playing && !buffering ? "is-animating" : ""}`} />
                      </div>
                    ) : (
                      <span className="drawer-item-index">
                        {ch.chapter_index !== undefined ? ch.chapter_index : absIdx + 1}
                      </span>
                    )}
                    <span className="drawer-item-title" title={ch.title || `Chương ${absIdx + 1}`}>
                      {ch.title || `Chương ${absIdx + 1}`}
                    </span>
                  </div>

                  <div className="drawer-item-right">
                    {isCurrent && <span className="drawer-playing-tag">Đang phát</span>}
                    {ch.has_audio && (
                      <span className="audio-badge-icon" title="Có âm thanh">
                        <Icon icon={Headphones} size={14} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Mobile Sticky Bottom Close Bar */}
        <div className="drawer-bottom-bar">
          <button
            type="button"
            className="drawer-bottom-close-btn"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Đóng danh sách chương"
          >
            <Icon icon={X} size={18} />
            <span>Đóng danh sách</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
