"""Voice Comparison Generator for Chapter 1.

Generates Chapter 1 audio across VieNeu-TTS v3 Turbo's optimal storytelling voices:
- Thiện Minh (Nam · Bắc · Kể chuyện)
- Ngọc Huyền (Nữ · Bắc · Tự nhiên)
- Quỳnh Anh (Nữ · Bắc · Đọc truyện)
- Hải Đăng (Nam · Bắc · Trầm ấm)
- Thái Sơn (Nam · Nam · Kể chuyện)
- Mỹ Duyên (Nữ · Nam · Đọc truyện)
- Quang Sơn (Nam · Trung · Tự nhiên)
- Custom Voice (LoRA Trained Voice)

Outputs to a dedicated comparison folder with an interactive HTML web player.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path
from typing import Any, Dict, List

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("voice_comparison")

VOICE_PROFILES = [
    {
        "id": "thienminh",
        "name": "Thiện Minh",
        "tag": "⭐ Chuẩn kể chuyện",
        "gender": "Nam",
        "region": "Bắc",
        "style": "Kể chuyện trầm ấm, lôi cuốn",
        "voice_arg": "Thiện Minh",
        "filename": "01_thienminh_nam_bac_kechuyen",
    },
    {
        "id": "ngochuyen",
        "name": "Ngọc Huyền",
        "tag": "⭐ Tự nhiên trong trẻo",
        "gender": "Nữ",
        "region": "Bắc",
        "style": "Truyền cảm, giọng đọc tự nhiên",
        "voice_arg": "Ngọc Huyền",
        "filename": "02_ngochuyen_nu_bac_tunhien",
    },
    {
        "id": "quynhanh",
        "name": "Quỳnh Anh",
        "tag": "Đọc truyện đêm khuya",
        "gender": "Nữ",
        "region": "Bắc",
        "style": "Phong cách đọc truyện sâu lắng",
        "voice_arg": "Quỳnh Anh",
        "filename": "03_quynhanh_nu_bac_doctruyen",
    },
    {
        "id": "haidang",
        "name": "Hải Đăng",
        "tag": "Trầm ấm tự nhiên",
        "gender": "Nam",
        "region": "Bắc",
        "style": "Giọng nam trẻ, tự nhiên",
        "voice_arg": "Hải Đăng",
        "filename": "04_haidang_nam_bac_tramam",
    },
    {
        "id": "thaison",
        "name": "Thái Sơn",
        "tag": "Kể chuyện hào hùng",
        "gender": "Nam",
        "region": "Nam Bộ",
        "style": "Hào sảng, phong cách kiếm hiệp",
        "voice_arg": "Thái Sơn",
        "filename": "05_thaison_nam_nam_kechuyen",
    },
    {
        "id": "myduyen",
        "name": "Mỹ Duyên",
        "tag": "Dịu dàng truyền cảm",
        "gender": "Nữ",
        "region": "Nam Bộ",
        "style": "Ngọt ngào, phong cách đọc truyện",
        "voice_arg": "Mỹ Duyên",
        "filename": "06_myduyen_nu_nam_doctruyen",
    },
    {
        "id": "quangson",
        "name": "Quang Sơn",
        "tag": "Đặc trưng miền Trung",
        "gender": "Nam",
        "region": "Miền Trung",
        "style": "Giọng đọc miền Trung mộc mạc",
        "voice_arg": "Quang Sơn",
        "filename": "07_quangson_nam_trung_tunhien",
    },
    {
        "id": "custom_lora",
        "name": "Custom LoRA Voice",
        "tag": "✨ Giọng Huấn Luyện Riêng",
        "gender": "Nam",
        "region": "Custom",
        "style": "Model LoRA Fine-tuned (1598 clips)",
        "voice_arg": "Custom Voice",
        "filename": "08_custom_voice_lora",
    },
]


def stitch_wavs_to_mp3(wav_files: List[Path], output_mp3: Path, bitrate: str = "128k") -> bool:
    """Concatenates wav files into an MP3."""
    if not wav_files:
        return False
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        logger.error("FFmpeg not found!")
        return False

    temp_txt = output_mp3.parent / f"concat_{os.getpid()}_{time.time_ns()}.txt"
    try:
        with open(temp_txt, "w", encoding="utf-8") as f:
            for w in wav_files:
                f.write(f"file '{w.resolve().as_posix()}'\n")

        cmd = [
            ffmpeg, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(temp_txt),
            "-c:a", "libmp3lame",
            "-b:a", bitrate,
            str(output_mp3),
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        return res.returncode == 0
    finally:
        if temp_txt.exists():
            temp_txt.unlink()


def generate_html_showcase(output_dir: Path, generated_voices: List[Dict[str, Any]], chapter_text: str):
    """Creates a standalone beautiful HTML player for comparing voices side-by-side."""
    cards_html = ""
    for v in generated_voices:
        mp3_name = f"{v['filename']}.mp3"
        cards_html += f"""
        <div class="voice-card">
          <div class="voice-header">
            <div class="voice-badge">{v['tag']}</div>
            <div class="voice-info">
              <h3 class="voice-name">{v['name']}</h3>
              <p class="voice-meta">{v['gender']} · {v['region']} · {v['style']}</p>
            </div>
          </div>
          <audio controls preload="none" class="audio-player">
            <source src="{mp3_name}" type="audio/mpeg">
            Trình duyệt không hỗ trợ thẻ audio.
          </audio>
          <div class="card-footer">
            <a href="{mp3_name}" download class="btn-download">⬇ Tải file MP3</a>
          </div>
        </div>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>So Sánh Giọng Đọc VieNeu-TTS v3 Turbo - Chương 1</title>
  <style>
    :root {{
      --bg: #0f1117;
      --card-bg: #181b24;
      --accent: #e05d44;
      --accent-hover: #f06a50;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --border: #282c39;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 32px 16px 80px;
      line-height: 1.6;
    }}
    .container {{
      max-width: 980px;
      margin: 0 auto;
    }}
    header {{
      text-align: center;
      margin-bottom: 36px;
    }}
    h1 {{
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
    }}
    .subtitle {{
      color: var(--text-muted);
      font-size: 15px;
    }}
    .sample-box {{
      background: rgba(224, 93, 68, 0.08);
      border: 1px solid rgba(224, 93, 68, 0.3);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 32px;
      font-size: 14px;
    }}
    .sample-title {{
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 6px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }}
    .voice-card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s, border-color 0.2s;
    }}
    .voice-card:hover {{
      border-color: var(--accent);
      transform: translateY(-2px);
    }}
    .voice-badge {{
      display: inline-block;
      background: rgba(224, 93, 68, 0.15);
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 999px;
      margin-bottom: 10px;
    }}
    .voice-name {{
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }}
    .voice-meta {{
      font-size: 12.5px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }}
    .audio-player {{
      width: 100%;
      height: 40px;
      margin-bottom: 12px;
    }}
    .card-footer {{
      display: flex;
      justify-content: flex-end;
    }}
    .btn-download {{
      font-size: 12px;
      color: var(--text-muted);
      text-decoration: none;
      padding: 4px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      transition: all 0.2s;
    }}
    .btn-download:hover {{
      color: #fff;
      border-color: var(--accent);
    }}
    .back-nav {{
      margin-bottom: 20px;
    }}
    .back-nav a {{
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
    }}
    .back-nav a:hover {{
      color: var(--accent);
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="back-nav">
      <a href="/reader.html?slug=tu-da-quai-bat-dau-tien-hoa-thang-cap-full&chapter=chapter_001">← Quay lại Trình đọc truyện</a>
    </div>
    <header>
      <h1>🎙️ So Sánh Giọng Đọc VieNeu-TTS v3 Turbo</h1>
      <p class="subtitle">Chương 1: Lão Tử Thành Sài Lang Nhân Suy Nhược (Tu Dã Quái Bắt Đầu Tiến Hóa Thăng Cấp)</p>
    </header>

    <div class="sample-box">
      <div class="sample-title">📖 Trích đoạn Chương 1:</div>
      <p style="color:var(--text);font-style:italic">"{chapter_text[:350]}..."</p>
    </div>

    <div class="grid">
      {cards_html}
    </div>
  </div>
</body>
</html>
"""
    (output_dir / "index.html").write_text(html_content, encoding="utf-8")
    logger.info(f"✨ Created comparison showcase at: {output_dir / 'index.html'}")


def main():
    parser = argparse.ArgumentParser(description="Generate Chapter 1 comparison across all optimal voices")
    parser.add_argument("--cues-file", default="/mnt/gdrive/audiobooks/tu-da-quai-bat-dau-tien-hoa-thang-cap-full/chapter_001_cues.json")
    parser.add_argument("--out-dir", default="/root/webtruyen/voices_chapter1_showcase")
    parser.add_argument("--frontend-dir", default="/root/webtruyen/frontend/voice_comparison")
    parser.add_argument("--custom-json", default="/root/webtruyen/models/custom_voice/voices_v3_turbo.json")
    parser.add_argument("--sentences", type=int, default=10, help="Number of sentences (default: 10 for fast audition, or 0 for all)")
    args = parser.parse_args()

    out_path = Path(args.out_dir).resolve()
    out_path.mkdir(parents=True, exist_ok=True)

    frontend_path = Path(args.frontend_dir).resolve()
    frontend_path.mkdir(parents=True, exist_ok=True)

    # 1. Load Cues
    cues_file = Path(args.cues_file)
    if not cues_file.exists():
        logger.error(f"Cues file not found: {cues_file}")
        sys.exit(1)

    with open(cues_file, "r", encoding="utf-8") as f:
        cues = json.load(f)

    if args.sentences > 0:
        cues = cues[:args.sentences]
        logger.info(f"Testing first {len(cues)} sentences for fast comparison.")
    else:
        logger.info(f"Rendering full chapter ({len(cues)} sentences).")

    full_text_sample = " ".join(c.get("text", "") for c in cues)

    # 2. Init Vieneu
    logger.info("Initializing VieNeu-TTS v3 Turbo...")
    import vieneu
    engine = vieneu.Vieneu()

    # Load custom voice if exists
    custom_json = Path(args.custom_json)
    if custom_json.exists():
        logger.info(f"Loading custom voice from {custom_json}...")
        engine._load_voices_from_file(custom_json)
    else:
        logger.warning(f"Custom voice JSON not found at {custom_json}")

    shm_dir = Path("/dev/shm") if Path("/dev/shm").is_dir() else Path(tempfile.gettempdir())
    temp_dir = shm_dir / f"compare_{os.getpid()}"
    temp_dir.mkdir(parents=True, exist_ok=True)

    generated_voices = []

    try:
        for p in VOICE_PROFILES:
            voice_arg = p["voice_arg"]
            # Check if voice exists in engine
            if voice_arg not in engine._preset_voices and voice_arg not in engine._voice_aliases:
                logger.warning(f"Voice '{voice_arg}' not available in engine. Skipping.")
                continue

            logger.info(f"🎙️ Generating for [{p['name']}] ({p['tag']})...")
            t_start = time.time()
            sentence_wavs = []

            for idx, c in enumerate(cues):
                txt = c.get("text", "").strip()
                if not txt:
                    continue
                wav_file = temp_dir / f"{p['id']}_{idx:03d}.wav"
                try:
                    audio_arr = engine.infer(txt, voice=voice_arg)
                    engine.save(audio_arr, str(wav_file))
                    sentence_wavs.append(wav_file)
                except Exception as e:
                    logger.error(f"Error inferring cue {idx} with {voice_arg}: {e}")

            # Stitch into final MP3 in both out_dir and frontend_dir
            out_mp3_primary = out_path / f"{p['filename']}.mp3"
            success = stitch_wavs_to_mp3(sentence_wavs, out_mp3_primary)
            if success:
                # Copy to frontend dir as well
                out_mp3_frontend = frontend_path / f"{p['filename']}.mp3"
                shutil.copy2(str(out_mp3_primary), str(out_mp3_frontend))
                elapsed = time.time() - t_start
                logger.info(f" Saved {out_mp3_primary.name} in {elapsed:.1f}s")
                generated_voices.append(p)
            else:
                logger.error(f"❌ Failed to stitch audio for {p['name']}")

            # Cleanup temp wavs for this voice
            for w in sentence_wavs:
                if w.exists():
                    w.unlink()

        # Generate HTML comparison page
        generate_html_showcase(out_path, generated_voices, full_text_sample)
        generate_html_showcase(frontend_path, generated_voices, full_text_sample)

    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)

    logger.info(" All voices generated successfully!")
    print(f"\n Hoàn tất! Bạn có thể xem và nghe so sánh tại:")
    print(f"- Thư mục trên server: {out_path}")
    print(f"- Web frontend: http://192.168.1.160:3080/voice_comparison/\n")


if __name__ == "__main__":
    main()
