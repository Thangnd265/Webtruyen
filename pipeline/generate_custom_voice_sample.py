"""Synthesizes high-fidelity sample chapter using tuned LoRA parameters and professional audio mastering."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import pyarrow.parquet as pq
from scipy import signal
import soundfile as sf
from vieneu import Vieneu

SENTENCES = [
    ("cue-1", "Chương 1: Khởi đầu mới tại Học viện Quý tộc."),
    ("cue-2", "Đối với Lâm Phong, ngày đầu tiên bước chân vào ngôi trường danh giá bậc nhất này chẳng khác nào một giấc mộng."),
    ("cue-3", "Xung quanh cậu toàn là những thiếu gia, thiên kim xuất thân từ các gia tộc hiển hách, xe sang áo gấm."),
    ("cue-4", "Thế nhưng, điều làm rung chuyển cả học viện hôm nay lại là sự xuất hiện của Tô Mộng Vũ, đại tiểu thư lạnh lùng của gia tộc họ Tô."),
    ("cue-5", "Cậu thiếu niên bình dân Lâm Phong đã bất ngờ có cuộc hội ngộ định mệnh với nàng ngay tại hành lang thư viện trung tâm."),
    ("cue-6", "Chào mừng bạn đang thưởng thức trải nghiệm đọc truyện và nghe audio đồng bộ thời gian thực chuẩn Tiểu Thuyết Mạng.")
]


def post_process_clip(audio: np.ndarray, sr: int = 48000) -> np.ndarray:
    """Removes out-of-band codec sizzle (>12kHz from 64kbps source) and applies smooth fade in/out."""
    # 6-pole Butterworth lowpass at 12kHz
    sos = signal.butter(6, 12000, 'lowpass', fs=sr, output='sos')
    filtered = signal.sosfilt(sos, audio)

    # 15ms fade in / fade out to eliminate boundary clicks
    fade_len = int(sr * 0.015)
    if len(filtered) > 2 * fade_len:
        fade_in = np.linspace(0, 1, fade_len)
        fade_out = np.linspace(1, 0, fade_len)
        filtered[:fade_len] *= fade_in
        filtered[-fade_len:] *= fade_out

    return filtered


def generate_high_quality_sample():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    model_dir = Path("finetune/output/custom_voice/merged").resolve()
    out_dir = Path("voices/sample-story").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Ensure Centroid Speaker Embedding is in voices_v3_turbo.json
    table = pq.read_table("finetune/dataset/train.parquet")
    embs = np.array(table["speaker_embedding"].to_pylist())
    mean_emb = np.mean(embs, axis=0)

    vpath = model_dir / "voices_v3_turbo.json"
    vdata = json.loads(vpath.read_text(encoding="utf-8")) if vpath.is_file() else {"presets": {}}
    vdata.setdefault("presets", {})["Custom Voice"] = {
        "description": "Centroid LoRA Fine-tuned Voice (1598 clips, high fidelity)",
        "gender": "male",
        "speaker_emb": [round(float(x), 6) for x in mean_emb],
        "codes": None
    }
    vdata["default_voice"] = "Custom Voice"
    vpath.write_text(json.dumps(vdata, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Loading merged LoRA model from {model_dir} on GPU...")
    engine = Vieneu(mode="v3turbo", device="cuda", backbone_repo=str(model_dir))

    wav_files = []
    cues = []
    cur_time = 0.0
    sr = 48000
    pause_audio = np.zeros(int(sr * 0.28), dtype=np.float32)  # 280ms natural pause

    print("Synthesizing 6 sample sentences with tuned smooth parameters...")
    for idx, (cue_id, text) in enumerate(SENTENCES):
        raw_audio = engine.infer(
            text=text,
            voice="Custom Voice",
            temperature=0.35,      # Lower temperature = smooth, stable, non-grainy
            top_p=0.85,            # Focused probability mass
            apply_watermark=False, # Disable watermark to remove high-frequency crackle/buzz
            denoise=False,         # Disable neural denoiser to preserve natural timbre
            use_ref_codes=False,
        )

        # Post-process: low-pass filter at 12kHz to eliminate 64kbps MP3 codec sizzle
        clean_audio = post_process_clip(raw_audio, sr=sr)

        # Append pause to end of clip for natural rhythm
        full_clip = np.concatenate([clean_audio, pause_audio])
        dur = round(len(full_clip) / sr, 2)

        start_t = round(cur_time, 2)
        end_t = round(cur_time + dur, 2)
        cur_time = end_t

        wav_path = out_dir / f"{cue_id}.wav"
        sf.write(str(wav_path), full_clip, sr, subtype="PCM_16")

        cues.append({"id": cue_id, "start": start_t, "end": end_t, "text": text})
        wav_files.append(wav_path)
        print(f"  [{cue_id}] ({start_t}s -> {end_t}s): {text}")

    # Concatenate all clips and normalize to -1.5 dBFS peak
    all_audio = np.concatenate([sf.read(str(p))[0] for p in wav_files])
    peak = np.max(np.abs(all_audio))
    if peak > 0:
        target_peak = 0.85  # -1.4 dBFS, safe from clipping
        all_audio = all_audio * (target_peak / peak)

    master_wav = out_dir / "chapter_001_master.wav"
    sf.write(str(master_wav), all_audio, sr, subtype="PCM_16")

    full_mp3 = out_dir / "chapter_001_custom_voice.mp3"
    print(f"Encoding master MP3: {full_mp3.name} at 192 kbps...")
    subprocess.run([
        ffmpeg, "-y",
        "-i", str(master_wav),
        "-c:a", "libmp3lame", "-b:a", "192k",
        str(full_mp3)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    master_wav.unlink(missing_ok=True)
    print(f"\n✅ High-Fidelity Audio Created: {full_mp3} ({cur_time:.2f}s)")
    return full_mp3


if __name__ == "__main__":
    generate_high_quality_sample()
