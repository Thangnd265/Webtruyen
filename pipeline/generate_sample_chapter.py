import asyncio
import json
import subprocess
from pathlib import Path
import edge_tts

SENTENCES = [
    ("cue-1", "Chương 1: Khởi đầu mới tại Học viện Quý tộc."),
    ("cue-2", "Đối với Lâm Phong, ngày đầu tiên bước chân vào ngôi trường danh giá bậc nhất này chẳng khác nào một giấc mộng."),
    ("cue-3", "Xung quanh cậu toàn là những thiếu gia, thiên kim xuất thân từ các gia tộc hiển hách, xe sang áo gấm."),
    ("cue-4", "Thế nhưng, điều làm rung chuyển cả học viện hôm nay lại là sự xuất hiện của Tô Mộng Vũ, đại tiểu thư lạnh lùng của gia tộc họ Tô."),
    ("cue-5", "Cậu thiếu niên bình dân Lâm Phong đã bất ngờ có cuộc hội ngộ định mệnh với nàng ngay tại hành lang thư viện trung tâm."),
    ("cue-6", "Chào mừng bạn đang thưởng thức trải nghiệm đọc truyện và nghe audio đồng bộ thời gian thực chuẩn Tiểu Thuyết Mạng.")
]

def get_audio_duration(file_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path)
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        # Fallback approximation for MP3 at 64kbps or wave
        return 5.0

async def generate(output_dir_path: str = None, ram_dir_path: str = None, voice: str = "vi-VN-HoaiMyNeural", pitch: str = "+0Hz", out_filename: str = "chapter_001"):
    if output_dir_path:
        output_dir = Path(output_dir_path)
    else:
        output_dir = Path("/mnt/gdrive/audiobooks/sample-story") if Path("/mnt/gdrive/audiobooks/sample-story").exists() else Path(__file__).resolve().parent / "sample_output"

    output_dir.mkdir(parents=True, exist_ok=True)

    if ram_dir_path:
        temp_dir = Path(ram_dir_path)
    else:
        temp_dir = Path("/dev/shm/tts_sample") if Path("/dev/shm").is_dir() else output_dir / "temp"

    temp_dir.mkdir(parents=True, exist_ok=True)

    cues = []
    current_time = 0.0
    concat_list = temp_dir / "concat.txt"
    concat_lines = []

    print(f"Synthesizing sentences with edge-tts (voice: {voice}, pitch: {pitch})...")
    for idx, (cue_id, text) in enumerate(SENTENCES):
        part_file = temp_dir / f"{cue_id}.mp3"
        pitch_kwargs = {"pitch": pitch} if pitch and pitch not in ("0Hz", "+0Hz", "0") else {}
        communicate = edge_tts.Communicate(text, voice, **pitch_kwargs)
        await communicate.save(str(part_file))

        duration = get_audio_duration(part_file)
        start_t = round(current_time, 2)
        end_t = round(current_time + duration, 2)
        current_time = end_t

        cues.append({
            "id": cue_id,
            "start": start_t,
            "end": end_t,
            "text": text
        })
        concat_lines.append(f"file '{part_file.resolve().as_posix()}'")
        print(f"[{cue_id}] ({start_t}s - {end_t}s): {text}")

    with open(concat_list, "w", encoding="utf-8") as f:
        f.write("\n".join(concat_lines))

    # Stitch into target MP3
    full_mp3 = output_dir / f"{out_filename}.mp3"
    print(f"Concatenating into {full_mp3.name}...")
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c:a", "libmp3lame", "-b:a", "128k",
        str(full_mp3)
    ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Save cues.json & html only if default chapter_001
    if out_filename == "chapter_001":
        full_m4b = output_dir / "chapter_001.m4b"
        print("Encoding into chapter_001.m4b (AAC)...")
        subprocess.run([
            "ffmpeg", "-y", "-i", str(full_mp3),
            "-c:a", "aac", "-b:a", "128k",
            str(full_m4b)
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        cues_file = output_dir / "chapter_001_cues.json"
        with open(cues_file, "w", encoding="utf-8") as f:
            json.dump(cues, f, ensure_ascii=False, indent=2)

        html_file = output_dir / "chapter_001.html"
        html_paragraphs = [
            f'  <p id="{c["id"]}" data-start="{c["start"]}" data-end="{c["end"]}" class="reader-paragraph">{c["text"]}</p>'
            for c in cues
        ]
        html_content = '<div class="chapter-content">\n' + '\n'.join(html_paragraphs) + '\n</div>\n'
        with open(html_file, "w", encoding="utf-8") as f:
            f.write(html_content)

    # Purge RAM chunks (0 MB SSD / 0 MB RAM waste)
    for p in temp_dir.glob("*.mp3"):
        try:
            p.unlink()
        except OSError:
            pass
    if concat_list.exists():
        concat_list.unlink()
    try:
        temp_dir.rmdir()
    except OSError:
        pass

    print(f"All files generated successfully in {output_dir} with 0 MB lingering temp storage.")

if __name__ == "__main__":
    import sys
    out_arg = sys.argv[1] if len(sys.argv) > 1 else None
    ram_arg = sys.argv[2] if len(sys.argv) > 2 else None
    voice_arg = sys.argv[3] if len(sys.argv) > 3 else "vi-VN-HoaiMyNeural"
    pitch_arg = sys.argv[4] if len(sys.argv) > 4 else "+0Hz"
    name_arg = sys.argv[5] if len(sys.argv) > 5 else "chapter_001"
    asyncio.run(generate(out_arg, ram_arg, voice_arg, pitch_arg, name_arg))
