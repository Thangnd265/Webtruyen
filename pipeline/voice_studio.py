"""Voice Studio for VieNeu-TTS v3 Turbo.

Provides utilities for:
1. Instant Voice Cloning (extracting 5-10s clips from long audio and generating speech)
2. Dataset preprocessing (VAD silence splitting, normalization to 48kHz Mono WAV)
3. LoRA Fine-Tuning configuration and execution
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

def get_ffmpeg_path() -> str:
    """Finds system ffmpeg or bundled imageio-ffmpeg binary."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    import shutil
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg
    raise RuntimeError("FFmpeg not found. Please install imageio-ffmpeg or ffmpeg.")


def extract_sample(
    input_audio: str,
    output_wav: str,
    start_time: str = "00:01:00",
    duration: float = 8.0,
    sample_rate: int = 48000,
) -> Path:
    """Extracts a clean, normalized mono WAV reference clip from a long audio file."""
    ffmpeg = get_ffmpeg_path()
    out_path = Path(output_wav).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        ffmpeg, "-y",
        "-ss", str(start_time),
        "-t", str(duration),
        "-i", str(input_audio),
        "-af", "silenceremove=1:0:-40dB,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", str(sample_rate),
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(out_path)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f" Extracted reference clip to: {out_path} ({duration}s at {start_time})")
    return out_path


def synthesize_test(
    ref_audio: str,
    text: str,
    output_file: str = "test_cloned.wav"
) -> Path:
    """Tests zero-shot voice cloning with VieNeu-TTS v3 Turbo."""
    from vieneu import Vieneu
    import soundfile as sf

    print(f" Khởi tạo mô hình VieNeu-TTS v3 Turbo...")
    engine = Vieneu()

    print(f" Đang sinh giọng nói theo mẫu '{ref_audio}'...")
    audio = engine.infer(text=text, ref_audio=str(ref_audio))

    out_path = Path(output_file).resolve()
    engine.save(audio, str(out_path))
    print(f" Đã lưu file audio mẫu tại: {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Voice Studio for VieNeu-TTS v3 Turbo")
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Command: extract
    extract_p = subparsers.add_parser("extract", help="Extract a reference voice clip from long audio")
    extract_p.add_argument("--input", "-i", required=True, help="Path to input audio (MP3/WAV)")
    extract_p.add_argument("--output", "-o", default="voices/my_voice.wav", help="Path to output WAV clip")
    extract_p.add_argument("--start", "-s", default="00:01:00", help="Start timestamp (HH:MM:SS or seconds)")
    extract_p.add_argument("--duration", "-d", type=float, default=8.0, help="Duration in seconds (5-10s recommended)")

    # Command: test-clone
    clone_p = subparsers.add_parser("clone", help="Clone voice and synthesize test sentence")
    clone_p.add_argument("--ref", "-r", required=True, help="Path to reference WAV file")
    clone_p.add_argument("--text", "-t", default="Xin chào các bạn, đây là giọng đọc AI được tạo từ chính file âm thanh của tôi.", help="Text to speak")
    clone_p.add_argument("--output", "-o", default="cloned_test.wav", help="Output WAV path")

    args = parser.parse_args()

    if args.command == "extract":
        extract_sample(args.input, args.output, args.start, args.duration)
    elif args.command == "clone":
        synthesize_test(args.ref, args.text, args.output)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
