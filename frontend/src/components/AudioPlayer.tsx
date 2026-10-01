import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";

export function AudioPlayer({ storyPath, chapter, totalChapters, locked = false }: { storyPath: string; chapter: number; totalChapters: number; locked?: boolean }) {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState("1");
  const [volume, setVolume] = useState(80);
  const first = Math.min(Math.max(1, chapter - 3), Math.max(1, totalChapters - 7));
  const playlist = Array.from({ length: Math.min(8, totalChapters - first + 1) }, (_, index) => first + index);

  function selectChapter(next: number) {
    setPlaying(false);
    setPosition(0);
    navigate(`${storyPath}/nghe/${next}`);
  }

  return <div className="audio-player">
    <p className="audio-state" role="status" aria-label="Trạng thái phát">{locked ? "Chương audio đang khóa trong bản mẫu. Bạn có thể chọn chương khác." : position === 100 ? "Đã hoàn thành chương mẫu." : playing ? "Đang phát mẫu." : "Sẵn sàng nghe mẫu."}</p>
    <div className="audio-player-controls"><button type="button" aria-label="Chương trước" disabled={chapter === 1} onClick={() => selectChapter(chapter - 1)}><Icon icon={SkipBack} /></button><button type="button" className="audio-play-button" disabled={locked} aria-label={playing ? "Tạm dừng" : position === 100 ? "Nghe lại" : "Phát"} aria-pressed={playing && !locked} onClick={() => { if (position === 100) setPosition(0); setPlaying(!playing); }}><Icon icon={playing && !locked ? Pause : Play} size={24} /></button><button type="button" aria-label="Chương sau" disabled={chapter === totalChapters} onClick={() => selectChapter(chapter + 1)}><Icon icon={SkipForward} /></button></div>
    <label className="audio-slider">Tiến độ chương <input type="range" min="0" max="100" disabled={locked} value={position} onChange={(event) => { const next = Number(event.target.value); setPosition(next); if (next === 100) setPlaying(false); }} /><output>{position}%</output></label>
    <div className="audio-settings"><label>Tốc độ <select disabled={locked} value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label><Icon icon={Volume2} /> Âm lượng <input type="range" min="0" max="100" disabled={locked} value={volume} onChange={(event) => setVolume(Number(event.target.value))} /><output>{volume}%</output></label></div>
    <section className="audio-playlist" aria-label="Danh sách phát"><h2>Danh sách phát</h2><ol>{playlist.map((number) => <li key={number}><button type="button" aria-current={number === chapter ? "true" : undefined} onClick={() => selectChapter(number)}>Chương {number}</button></li>)}</ol></section>
  </div>;
}
