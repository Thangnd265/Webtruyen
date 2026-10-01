import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { AudioLoader } from "./AudioLoader";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { BackendChapter, ChapterCue } from "../data/api";

export function AudioPlayer({
  storyPath,
  chapterIndex,
  chapters,
  audioSrc,
  locked = false,
  storyTitle = "",
}: {
  storyPath: string;
  chapterIndex: number;
  chapters: BackendChapter[];
  audioSrc?: string;
  locked?: boolean;
  storyTitle?: string;
}) {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState("1");
  const [volume, setVolume] = useState(80);
  const [audioError, setAudioError] = useState(false);

  const totalChapters = Math.max(chapters.length, 1);
  const currentChapter = chapters[chapterIndex] || {
    id: String(chapterIndex + 1),
    title: `Chương ${chapterIndex + 1}`,
  };

  // Build playlist range centered around active chapter
  const first = Math.min(Math.max(0, chapterIndex - 3), Math.max(0, totalChapters - 7));
  const playlist = chapters.slice(first, first + 8);

  useEffect(() => {
    setPlaying(false);
    setBuffering(false);
    setPosition(0);
    setCurrentTime(0);
    setAudioError(false);
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(speed);
      audioRef.current.volume = volume / 100;
    }
  }, [audioSrc, chapterIndex]);

  function togglePlay() {
    if (!audioRef.current || locked) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setPlaying(true))
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
  }

  function handleSeek(val: number) {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration || 0;
    setPosition(val);
    if (dur > 0) {
      audioRef.current.currentTime = (val / 100) * dur;
    }
  }

  function handleSpeedChange(newSpeed: string) {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(newSpeed);
    }
  }

  function handleVolumeChange(val: number) {
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val / 100;
    }
  }

  function selectChapter(idx: number) {
    if (idx < 0 || idx >= chapters.length) return;
    const target = chapters[idx];
    navigate(`${storyPath}/nghe/${target ? target.id : idx + 1}`);
  }

  function formatTime(sec: number) {
    if (!Number.isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="audio-player">
      {/* Vinyl Record Disc Spin Animation (Máy đĩa than) */}
      <div
        className={`vinyl-disc-box audio-disc-spin ${!playing ? "paused" : ""}`}
        onClick={togglePlay}
        title={playing ? "Bấm vào đĩa để tạm dừng" : "Bấm vào đĩa để phát nhạc"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            togglePlay();
          }
        }}
        aria-label={playing ? "Đang quay đĩa than, bấm để tạm dừng" : "Đĩa than đang dừng, bấm để phát"}
      >
        <div className="vinyl-center-dot">
          {(storyTitle || currentChapter.title || "A").trim().charAt(0).toUpperCase()}
        </div>
      </div>

      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleTimeUpdate}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={() => {
            setPlaying(false);
            setBuffering(false);
            if (chapterIndex < chapters.length - 1) {
              selectChapter(chapterIndex + 1);
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
          ? `Sẵn sàng phát (${formatTime(duration)})`
          : "Sẵn sàng nghe truyện"}
      </p>

      <div className="audio-player-controls">
        <button
          type="button"
          aria-label="Chương trước"
          disabled={chapterIndex === 0}
          onClick={() => selectChapter(chapterIndex - 1)}
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
          onClick={() => selectChapter(chapterIndex + 1)}
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
                  onClick={() => selectChapter(absIdx)}
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
