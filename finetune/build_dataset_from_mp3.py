"""Automated Dataset Builder for VieNeu-TTS v3 Turbo LoRA Fine-tuning.

Extracts a clean slice from long audio, transcribes with faster-whisper,
normalizes to 48kHz Mono WAV clips, and builds metadata.csv ready for prepare_dataset.py.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import time
from pathlib import Path
from typing import List

import imageio_ffmpeg
from faster_whisper import WhisperModel


def clean_vietnamese_text(text: str) -> str:
    """Cleans and normalizes Vietnamese text."""
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return text


def build_dataset(
    audio_path: str,
    output_dir: str = "finetune/dataset",
    start_time: str = "00:01:00",
    minutes: float = 12.0,
    min_clip_sec: float = 2.0,
    max_clip_sec: float = 15.0,
    model_size: str = "small"
) -> int:
    out_dir = Path(output_dir).resolve()
    raw_audio_dir = out_dir / "raw_audio"
    raw_audio_dir.mkdir(parents=True, exist_ok=True)
    metadata_csv = out_dir / "metadata.csv"

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    slice_sec = int(minutes * 60)

    temp_slice = out_dir / "temp_slice.wav"
    print(f"🎵 [1/3] Đang cắt nhanh đoạn {minutes:.1f} phút từ {start_time} của '{audio_path}'...", flush=True)
    cmd = [
        ffmpeg, "-y",
        "-ss", str(start_time),
        "-t", str(slice_sec),
        "-i", str(audio_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "48000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(temp_slice)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"   Đã trích xuất file tạm: {temp_slice}", flush=True)

    print(f"🎙️ [2/3] Nạp Whisper ({model_size}) và nhận diện giọng nói tiếng Việt...", flush=True)
    whisper = WhisperModel(model_size, device="cpu", compute_type="int8")

    t0 = time.time()
    segments, info = whisper.transcribe(
        str(temp_slice),
        language="vi",
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=450)
    )

    print(f"✂️ [3/3] Đang cắt nhỏ từng câu thoại thành clips và ghi metadata.csv...", flush=True)
    rows: List[str] = []
    total_audio_sec = 0.0
    idx = 1

    for seg in segments:
        dur = seg.end - seg.start
        if not (min_clip_sec <= dur <= max_clip_sec):
            continue

        text = clean_vietnamese_text(seg.text)
        if len(text) < 6:
            continue

        clip_name = f"clip_{idx:04d}.wav"
        clip_path = raw_audio_dir / clip_name

        # Extract clip from temp_slice
        cmd = [
            ffmpeg, "-y",
            "-ss", f"{seg.start:.3f}",
            "-to", f"{seg.end:.3f}",
            "-i", str(temp_slice),
            "-c:a", "copy",
            str(clip_path)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        rows.append(f"{clip_name}|{text}")
        total_audio_sec += dur

        if idx % 10 == 0 or idx == 1:
            print(f"   [{idx:03d}] {dur:4.1f}s | Tổng: {total_audio_sec/60:.1f}m | {text[:50]}...", flush=True)

        idx += 1

    # Cleanup temp_slice
    try:
        temp_slice.unlink(missing_ok=True)
    except Exception:
        pass

    with open(metadata_csv, "w", encoding="utf-8") as f:
        f.write("\n".join(rows) + "\n")

    t1 = time.time()
    print(f"\n✅ Hoàn tất tạo dataset trong {t1-t0:.1f}s!", flush=True)
    print(f"📊 Tổng số clips: {len(rows)} clips ({total_audio_sec/60:.1f} phút âm thanh chuẩn)")
    print(f"📄 Metadata: {metadata_csv}", flush=True)
    print(f"📁 Thư mục clips: {raw_audio_dir}", flush=True)
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Build LoRA dataset from audio file")
    parser.add_argument("--input", "-i", default="Giọng mẫu.mp3", help="Input audio file")
    parser.add_argument("--output-dir", "-o", default="finetune/dataset", help="Output dataset directory")
    parser.add_argument("--start", "-s", default="00:01:00", help="Start offset in audio")
    parser.add_argument("--minutes", "-m", type=float, default=12.0, help="Total minutes to slice")
    args = parser.parse_args()

    build_dataset(args.input, args.output_dir, start_time=args.start, minutes=args.minutes)


if __name__ == "__main__":
    main()
