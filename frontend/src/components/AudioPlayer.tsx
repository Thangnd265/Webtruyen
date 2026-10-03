import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { AudioLoader } from "./AudioLoader";
import { VinylTurntable } from "./VinylTurntable";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { preloadChapter, type BackendChapter } from "../data/api";
import { useAuth } from "../context/AuthContext";

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

  // Build playlist range centered around active chapter
  const first = Math.min(Math.max(0, chapterIndex - 3), Math.max(0, totalChapters - 7));
  const playlist = chapters.slice(first, first + 8);

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
    }

    if (initialAutoPlay && audioSrc && !locked) {
      setBuffering(true);
      const audio = audioRef.current;
      if (audio) {
        const startPlay = () => {
          if (!hasSeekedInitialRef.current && initSec > 0) {
            try {
              audio.currentTime = initSec;
              hasSeekedInitialRef.current = true;
            } catch (err) {
              console.warn("Could not seek initial time in startPlay:", err);
            }
          }
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
            });
        };
        if (audio.readyState >= 2) {
          startPlay();
        } else {
          audio.addEventListener("canplay", startPlay, { once: true });
        }
      }
    } else {
      setPlaying(false);
      setBuffering(false);
    }
  }, [audioSrc, chapterIndex, initialAutoPlay, initialTime, speed]);

  const syncProgress = useCallback(
    (curTime: number, dur: number, force = false) => {
      if (!token) return;
      const now = Date.now();
      if (!force && now - lastSyncRef.current < 10000) return;
      lastSyncRef.current = now;

      const slug = storyPath.replace(/^\/truyen\//, "").replace(/\/.*$/, "");
      const ch = chapters[chapterIndex];
      if (!slug || !ch) return;

      fetch("/api/user/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          book_slug: slug,
          book_title: storyTitle || slug,
          book_author: "",
          book_cover: coverUrl || "",
          chapter_id: ch.id,
          chapter_title: ch.title,
          current_time: curTime,
          duration: dur,
          progress: dur > 0 ? Number((curTime / dur).toFixed(4)) : 0,
        }),
      }).catch((err) => console.warn("Sync history error:", err));
    },
    [token, storyPath, chapters, chapterIndex, storyTitle, coverUrl]
  );

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

    // Smart Gapless Preload: Preload next chapter when within 30s of end or 75% progress
    if (autoNext && dur > 0 && chapterIndex < chapters.length - 1) {
      const remaining = dur - cur;
      const progress = cur / dur;
      const nextChapter = chapters[chapterIndex + 1];
      if (nextChapter && (remaining <= 30 || progress >= 0.75) && preloadedChapterRef.current !== nextChapter.id) {
        preloadedChapterRef.current = nextChapter.id;
        const slug = storyPath.replace(/^\/truyen\//, "").replace(/\/.*$/, "");
        const targetAudioUrl = `/api/books/${slug}/audio/${nextChapter.id}${currentVoice ? `?voice=${encodeURIComponent(currentVoice)}` : ""}`;
        preloadChapter(slug, nextChapter.id, currentVoice, targetAudioUrl);
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
    <div className="audio-player">
      {/* Hi-Fi Animated Vinyl Turntable (Máy đĩa than siêu thực) */}
      <VinylTurntable
        playing={playing && !buffering}
        onTogglePlay={togglePlay}
        coverUrl={coverUrl}
        title={storyTitle || currentChapter.title}
        progress={duration > 0 ? currentTime / duration : 0}
        disabled={locked || !audioSrc}
      />

      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
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

      <p className="audio-state" role="status" aria-label="Trạng thái phát">
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
      </p>

      <div className="audio-player-controls">
        <button
          type="button"
          aria-label="Chương trước"
          disabled={chapterIndex === 0}
          onClick={() => selectChapter(chapterIndex - 1, playing)}
        >
          <Icon icon={SkipBack} />
        </button>
        <button
          type="button"
          className="audio-play-button"
          disabled={locked}
          aria-label={playing ? "Tạm dừng" : "Phát"}
          aria-pressed={playing && !locked}
          onClick={togglePlay}
        >
          <Icon icon={playing && !locked ? Pause : Play} size={24} />
        </button>
        <button
          type="button"
          aria-label="Chương sau"
          disabled={chapterIndex >= chapters.length - 1}
          onClick={() => selectChapter(chapterIndex + 1, playing)}
        >
          <Icon icon={SkipForward} />
        </button>
      </div>

      <label className="audio-slider">
        Tiến độ chương ({formatTime(currentTime)} / {formatTime(duration)})
        <input
          type="range"
          min="0"
          max="100"
          disabled={locked || duration === 0}
          value={position}
          onChange={(e) => handleSeek(Number(e.target.value))}
        />
        <output>{position}%</output>
      </label>

      <div className="audio-settings">
        <label>
          Tốc độ{" "}
          <select disabled={locked} value={speed} onChange={(e) => handleSpeedChange(e.target.value)}>
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <label>
          <Icon icon={Volume2} /> Âm lượng{" "}
          <input
            type="range"
            min="0"
            max="100"
            disabled={locked}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
          />
          <output>{volume}%</output>
        </label>
        <label
          className="audio-auto-next"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
            userSelect: "none",
            marginLeft: "auto",
          }}
          title="Tự động phát chương tiếp theo khi nghe hết"
        >
          <input
            type="checkbox"
            checked={autoNext}
            onChange={(e) => {
              const val = e.target.checked;
              setAutoNext(val);
              localStorage.setItem("webtruyen_auto_next", String(val));
              updatePreferences({ autoNext: val });
            }}
            style={{
              accentColor: "var(--brand, #6366f1)",
              width: "16px",
              height: "16px",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: "12px", fontWeight: 500 }}>Tự chuyển chương</span>
        </label>
      </div>

      <section className="audio-playlist" aria-label="Danh sách phát">
        <h2>Danh sách phát chương</h2>
        <ol>
          {playlist.map((ch, relIdx) => {
            const absIdx = first + relIdx;
            const isCurrent = absIdx === chapterIndex;
            return (
              <li key={ch.id || absIdx}>
                <button
                  type="button"
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => selectChapter(absIdx, true)}
                >
                  {ch.title || `Chương ${absIdx + 1}`}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
