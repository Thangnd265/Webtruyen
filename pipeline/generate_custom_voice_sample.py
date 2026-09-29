"""Synthesizes sample chapter using fine-tuned LoRA model for Webtruyenv2 Web Reader."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import imageio_ffmpeg
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


def generate_custom_voice_sample():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    model_dir = Path("finetune/output/custom_voice/merged").resolve()
    out_dir = Path("voices/sample-story").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading merged LoRA model from {model_dir} on GPU...")
    engine = Vieneu(mode="v3turbo", device="cuda", backbone_repo=str(model_dir))

    wav_files = []
    cues = []
    cur_time = 0.0

    print("Synthesizing 6 sample sentences with fine-tuned Custom Voice...")
    for cue_id, text in SENTENCES:
        wav_path = out_dir / f"{cue_id}.wav"
        audio = engine.infer(text=text, voice="Custom Voice")
        engine.save(audio, str(wav_path))

        data, sr = sf.read(str(wav_path))
        dur = round(len(data) / sr, 2)
        start_t = round(cur_time, 2)
        end_t = round(cur_time + dur, 2)
        cur_time = end_t

        cues.append({"id": cue_id, "start": start_t, "end": end_t, "text": text})
        wav_files.append(wav_path)
        print(f"  [{cue_id}] ({start_t}s -> {end_t}s): {text}")

    concat_file = out_dir / "concat.txt"
    lines = [f"file '{p.resolve().as_posix()}'" for p in wav_files]
    concat_file.write_text("\n".join(lines), encoding="utf-8")

    full_mp3 = out_dir / "chapter_001_custom_voice.mp3"
    print(f"Stitching into {full_mp3.name}...")
    subprocess.run([
        ffmpeg, "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_file),
        "-c:a", "libmp3lame", "-b:a", "128k",
        str(full_mp3)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(f"\n✅ Created: {full_mp3} ({cur_time:.2f}s)")
    return full_mp3


if __name__ == "__main__":
    generate_custom_voice_sample()
