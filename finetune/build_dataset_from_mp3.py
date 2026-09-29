"""Ultra-Fast 2,000-Clip LoRA Dataset Builder using VAD + Batched Whisper on RTX 5060.

1. Exports master audio to 48kHz Mono PCM WAV with loudness normalization
2. High-speed NumPy VAD segmentation into natural speech clips (1.5s - 8.5s)
3. Saves WAV clips into raw_audio/clip_XXXXX.wav
4. High-throughput GPU batched transcription with Whisper-base on CUDA (batch_size=32)
5. Writes metadata.csv
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import time
from pathlib import Path
from typing import List, Tuple

import numpy as np
import soundfile as sf
import torch
from transformers import pipeline


def clean_vietnamese_text(text: str) -> str:
    """Cleans and normalizes Vietnamese text."""
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return text


def segment_audio_vad(
    audio: np.ndarray,
    sr: int,
    min_clip_sec: float = 1.5,
    max_clip_sec: float = 8.5,
    silence_db: float = -38.0,
    min_silence_sec: float = 0.20,
    max_clips: int = 2000,
) -> List[Tuple[int, int]]:
    """Segments continuous speech audio into natural sentence/phrase clips using RMS energy."""
    frame_len = int(sr * 0.05)  # 50ms
    hop_len = int(sr * 0.025)   # 25ms
    
    # Calculate RMS per frame
    num_frames = (len(audio) - frame_len) // hop_len
    if num_frames <= 0:
        return []

    # Vectorized / blocked frame RMS calculation
    frames = audio[:num_frames * hop_len + frame_len].reshape(-1, hop_len)
    # Using sliding window view if available, or chunked
    shape = (num_frames, frame_len)
    strides = (audio.strides[0] * hop_len, audio.strides[0])
    as_strided = np.lib.stride_tricks.as_strided(audio, shape=shape, strides=strides)
    rms = np.sqrt(np.mean(as_strided**2, axis=1))
    db = 20 * np.log10(rms + 1e-7)

    is_speech = db > silence_db
    min_sil_frames = int(min_silence_sec / 0.025)

    raw_segments: List[Tuple[int, int]] = []
    in_speech = False
    seg_start = 0

    for i, s in enumerate(is_speech):
        if s and not in_speech:
            in_speech = True
            seg_start = i
        elif not s and in_speech:
            # Check length of silence
            sil_count = 0
            while i + sil_count < len(is_speech) and not is_speech[i + sil_count]:
                sil_count += 1
            if sil_count >= min_sil_frames:
                in_speech = False
                raw_segments.append((seg_start, i))

    if in_speech:
        raw_segments.append((seg_start, len(is_speech)))

    # Subdivide any segments > max_clip_sec at local energy dips
    final_clips: List[Tuple[int, int]] = []
    for start_f, end_f in raw_segments:
        dur_s = (end_f - start_f) * 0.025
        if dur_s < min_clip_sec:
            continue
        if dur_s <= max_clip_sec:
            start_samp = int(start_f * 0.025 * sr)
            end_samp = int(end_f * 0.025 * sr)
            final_clips.append((start_samp, end_samp))
        else:
            curr = start_f
            while (end_f - curr) * 0.025 > max_clip_sec:
                target_f = curr + int(4.5 / 0.025)
                w_start = max(curr, target_f - int(1.5 / 0.025))
                w_end = min(end_f, target_f + int(1.5 / 0.025))
                search_win = rms[w_start:w_end]
                split_f = w_start + int(np.argmin(search_win))
                
                start_samp = int(curr * 0.025 * sr)
                end_samp = int(split_f * 0.025 * sr)
                final_clips.append((start_samp, end_samp))
                curr = split_f

            if (end_f - curr) * 0.025 >= min_clip_sec:
                start_samp = int(curr * 0.025 * sr)
                end_samp = int(end_f * 0.025 * sr)
                final_clips.append((start_samp, end_samp))

        if len(final_clips) >= max_clips:
            break

    return final_clips[:max_clips]


def build_dataset_fast(
    audio_path: str,
    output_dir: str = "finetune/dataset",
    start_time: str = "00:00:05",
    target_minutes: float = 125.0,
    max_clips: int = 2000,
    model_id: str = "openai/whisper-base",
    batch_size: int = 32,
) -> int:
    out_dir = Path(output_dir).resolve()
    raw_audio_dir = out_dir / "raw_audio"
    raw_audio_dir.mkdir(parents=True, exist_ok=True)
    metadata_csv = out_dir / "metadata.csv"

    slice_sec = int(target_minutes * 60)
    temp_wav = out_dir / "temp_full_48k.wav"

    print(f"🎵 [1/4] Xuất {target_minutes:.0f} phút âm thanh chuẩn 48kHz Mono PCM...", flush=True)
    t_start = time.time()
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_time),
        "-t", str(slice_sec),
        "-i", str(audio_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "48000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(temp_wav)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"   Master WAV: {temp_wav} ({temp_wav.stat().st_size / (1024*1024):.1f} MB)", flush=True)

    print(f"✂️ [2/4] Nạp audio và phân đoạn VAD thành tối đa {max_clips} clips...", flush=True)
    t_seg_0 = time.time()
    master_audio, sr = sf.read(str(temp_wav), dtype="float32")
    clip_ranges = segment_audio_vad(master_audio, sr, max_clips=max_clips)
    print(f"   Đã phát hiện {len(clip_ranges)} clips lời thoại trong {time.time() - t_seg_0:.2f}s!", flush=True)

    # Clean old clips in raw_audio to prevent mixing
    for old_file in raw_audio_dir.glob("clip_*.wav"):
        try:
            old_file.unlink()
        except Exception:
            pass

    # Save clips to disk and prepare audio data for Whisper
    saved_clips = []
    total_audio_sec = 0.0
    for idx, (s_samp, e_samp) in enumerate(clip_ranges, 1):
        clip_name = f"clip_{idx:05d}.wav"
        clip_path = raw_audio_dir / clip_name
        clip_data = master_audio[s_samp:e_samp]
        dur = len(clip_data) / sr

        sf.write(str(clip_path), clip_data, sr, subtype="PCM_16")
        saved_clips.append((clip_name, clip_data, dur))
        total_audio_sec += dur

    print(f"   Đã ghi {len(saved_clips)} file WAV ({total_audio_sec/60:.1f} phút âm thanh) vào {raw_audio_dir}", flush=True)

    # Clean master wav to save disk
    try:
        temp_wav.unlink(missing_ok=True)
    except Exception:
        pass

    print(f"🎙️ [3/4] Nạp Whisper ({model_id}) trên GPU NVIDIA RTX 5060 (batch_size={batch_size})...", flush=True)
    pipe = pipeline(
        "automatic-speech-recognition",
        model=model_id,
        device="cuda",
        dtype=torch.float16,
        model_kwargs={"attn_implementation": "sdpa"},
    )

    print(f"⚡ [4/4] Phiên âm song song {len(saved_clips)} clips bằng GPU...", flush=True)
    t_transcribe_0 = time.time()
    rows: List[str] = []

    # Process in batches
    for b_start in range(0, len(saved_clips), batch_size):
        b_end = min(b_start + batch_size, len(saved_clips))
        batch = saved_clips[b_start:b_end]

        inputs = [{"raw": item[1], "sampling_rate": sr} for item in batch]
        outputs = pipe(inputs, batch_size=len(batch), generate_kwargs={"language": "vietnamese"})

        for (clip_name, _, dur), out in zip(batch, outputs):
            raw_text = out.get("text", "")
            text = clean_vietnamese_text(raw_text)
            if len(text) < 2:
                continue
            rows.append(f"{clip_name}|{text}")

        elapsed = time.time() - t_transcribe_0
        done_count = len(rows)
        rate = done_count / max(0.1, elapsed)
        remain_s = (len(saved_clips) - done_count) / max(0.1, rate)
        if b_end % 100 < batch_size or b_end == len(saved_clips):
            print(f"   [{done_count:04d}/{len(saved_clips)}] {rate:4.1f} clips/s | Còn lại: ~{remain_s/60:.1f}m | {rows[-1].split('|')[1][:45]}...", flush=True)

    with open(metadata_csv, "w", encoding="utf-8") as f:
        f.write("\n".join(rows) + "\n")

    t_end = time.time()
    print(f"\n✅ Hoàn tất tạo dataset trong {t_end - t_start:.1f}s (~{(t_end - t_start)/60:.1f} phút)!", flush=True)
    print(f"📊 Tổng số clips tạo ra: {len(rows)} clips ({total_audio_sec/60:.1f} phút âm thanh chuẩn)")
    print(f"📄 Metadata: {metadata_csv}", flush=True)
    print(f"📁 Thư mục clips: {raw_audio_dir}", flush=True)
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Ultra-fast 2000-clip LoRA dataset builder")
    parser.add_argument("--input", "-i", default="Giọng mẫu.mp3", help="Input audio file")
    parser.add_argument("--output-dir", "-o", default="finetune/dataset", help="Output directory")
    parser.add_argument("--minutes", "-m", type=float, default=125.0, help="Minutes of audio to process")
    parser.add_argument("--clips", "-c", type=int, default=2000, help="Maximum number of clips")
    parser.add_argument("--model", default="openai/whisper-base", help="Whisper model ID")
    parser.add_argument("--batch-size", "-b", type=int, default=32, help="Batch size for transcription")
    args = parser.parse_args()

    build_dataset_fast(
        args.input,
        args.output_dir,
        target_minutes=args.minutes,
        max_clips=args.clips,
        model_id=args.model,
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
