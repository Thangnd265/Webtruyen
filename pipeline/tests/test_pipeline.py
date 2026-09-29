import json
import os
import shutil
import tempfile
import wave
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

from apps.web_reader.pipeline.generate_audiobook import (
    get_default_ram_dir,
    TTSEngine,
    stitch_to_m4b,
    process_chapter,
    generate_audiobook,
)


def test_default_ram_dir_selection():
    ram_dir = get_default_ram_dir()
    assert isinstance(ram_dir, Path)
    # On Linux /dev/shm is used if writable; on other systems fallback to tempfile
    if Path("/dev/shm").is_dir() and os.access("/dev/shm", os.W_OK):
        assert ram_dir == Path("/dev/shm")
    else:
        assert str(ram_dir) == tempfile.gettempdir()


def test_tts_mock_synthesis_creates_valid_wav(tmp_path):
    tts = TTSEngine(dry_run=True)
    wav_path = tmp_path / "test_cue.wav"
    duration = tts.synthesize_sentence("Hôm nay trời rất đẹp.", wav_path)

    assert wav_path.exists()
    assert duration > 0

    # Verify wave header and exact duration match
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        measured_duration = round(frames / float(rate), 3)
        assert measured_duration == duration


def test_chapter_cues_timing_accumulation(tmp_path):
    ram_base = tmp_path / "shm"
    ram_base.mkdir()
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    chapter = {
        "id": "chapter_001",
        "title": "Chương 1: Khởi đầu",
        "chapter_index": 1,
        "html": "<p>Câu thứ nhất trong truyện. Câu thứ hai tiếp nối! Câu thứ ba kết thúc.</p>",
    }

    tts = TTSEngine(dry_run=True)
    result = process_chapter(
        chapter=chapter,
        output_dir=output_dir,
        tts=tts,
        ram_base_dir=ram_base,
        slug="test-book",
        bitrate="64k",
        skip_existing=False,
    )

    assert result["status"] == "processed"
    cues_file = output_dir / "chapter_001_cues.json"
    assert cues_file.exists()

    cues = json.loads(cues_file.read_text(encoding="utf-8"))
    assert len(cues) == 3

    # Check timing accumulation
    assert cues[0]["start"] == 0.0
    assert cues[0]["end"] > cues[0]["start"]
    assert cues[1]["start"] == cues[0]["end"]
    assert cues[1]["end"] > cues[1]["start"]
    assert cues[2]["start"] == cues[1]["end"]
    assert cues[2]["end"] > cues[2]["start"]

    # Verify HTML output
    html_file = output_dir / "chapter_001.html"
    assert html_file.exists()
    html_content = html_file.read_text(encoding="utf-8")
    assert 'id="cue-1"' in html_content
    assert 'class="reader-paragraph"' in html_content


def test_ram_cleanup_after_chapter_processing(tmp_path):
    ram_base = tmp_path / "shm"
    ram_base.mkdir()
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    chapter = {
        "id": "chapter_001",
        "title": "Chương 1",
        "chapter_index": 1,
        "html": "<p>Một câu đơn giản.</p>",
    }

    tts = TTSEngine(dry_run=True)
    process_chapter(
        chapter=chapter,
        output_dir=output_dir,
        tts=tts,
        ram_base_dir=ram_base,
        slug="test-book",
    )

    # All subdirectories in ram_base should be purged
    remaining_dirs = list(ram_base.glob("tts_batch_*"))
    assert len(remaining_dirs) == 0, f"RAM directory was not cleaned up: {remaining_dirs}"


def test_resume_skips_existing_chapter(tmp_path):
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    # Pre-populate chapter files
    (output_dir / "chapter_001.m4b").write_bytes(b"dummy-audio-content")
    cues_data = [{"id": "cue-1", "start": 0.0, "end": 2.0, "text": "Đã có sẵn."}]
    (output_dir / "chapter_001_cues.json").write_text(json.dumps(cues_data), encoding="utf-8")

    chapter = {
        "id": "chapter_001",
        "title": "Chương 1",
        "chapter_index": 1,
        "html": "<p>Nội dung mới nếu phải chạy lại.</p>",
    }

    tts = MagicMock()
    result = process_chapter(
        chapter=chapter,
        output_dir=output_dir,
        tts=tts,
        ram_base_dir=tmp_path / "shm",
        slug="test-book",
        skip_existing=True,
    )

    assert result["status"] == "skipped"
    # TTS should not be called when skipped
    assert not tts.synthesize_sentence.called


def test_generate_audiobook_creates_metadata(tmp_path):
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    ram_dir = tmp_path / "shm"
    ram_dir.mkdir()

    chapters = [
        {"id": "chapter_001", "title": "Chương 1: Mở đầu", "chapter_index": 1, "html": "<p>Mở đầu truyện.</p>"},
        {"id": "chapter_002", "title": "Chương 2: Diễn biến", "chapter_index": 2, "html": "<p>Diễn biến gay cấn.</p>"},
    ]

    meta = {
        "title": "Kiếm Hiệp Kỳ Duyên",
        "author": "Tiêu Dao Tử",
        "description": "Truyện kiếm hiệp đặc sắc",
    }

    res = generate_audiobook(
        slug="kiem-hiep-ky-duyen",
        output_base_dir=output_dir,
        chapters=chapters,
        metadata_info=meta,
        ram_dir=ram_dir,
        dry_run=True,
    )

    book_dir = output_dir / "kiem-hiep-ky-duyen"
    assert (book_dir / "metadata.json").exists()
    book_meta = json.loads((book_dir / "metadata.json").read_text(encoding="utf-8"))
    assert book_meta["title"] == "Kiếm Hiệp Kỳ Duyên"
    assert book_meta["author"] == "Tiêu Dao Tử"
    assert len(book_meta["chapters"]) == 2
    assert (book_dir / "chapter_001.m4b").exists()
    assert (book_dir / "chapter_001_cues.json").exists()
    assert (book_dir / "chapter_002.m4b").exists()
    assert (book_dir / "chapter_002_cues.json").exists()


def test_extract_and_generate_from_epub_file(tmp_path):
    from ebooklib import epub
    from apps.web_reader.pipeline.generate_audiobook import extract_epub_chapters

    epub_file = tmp_path / "sample.epub"
    book = epub.EpubBook()
    book.set_identifier("sample-id-123")
    book.set_title("Truyện Mẫu")
    book.set_language("vi")
    book.add_author("Tác Giả Mẫu")

    c1 = epub.EpubHtml(title="Chương 1", file_name="chap_01.xhtml", lang="vi")
    c1.content = "<h1>Chương 1: Khởi đầu mới</h1><p>Mặt trời lên cao. Gió thổi nhè nhẹ.</p>"
    book.add_item(c1)
    book.spine = ["nav", c1]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    epub.write_epub(str(epub_file), book, {})

    metadata_info, chapters = extract_epub_chapters(epub_file)
    assert metadata_info["title"] == "Truyện Mẫu"
    assert metadata_info["author"] == "Tác Giả Mẫu"
    assert len(chapters) == 1
    assert chapters[0]["title"] == "Chương 1: Khởi đầu mới"

    output_dir = tmp_path / "epub_out"
    ram_dir = tmp_path / "shm"
    ram_dir.mkdir()

    res = generate_audiobook(
        slug="truyen-mau",
        output_base_dir=output_dir,
        chapters=chapters,
        metadata_info=metadata_info,
        ram_dir=ram_dir,
        dry_run=True,
    )

    book_dir = output_dir / "truyen-mau"
    assert (book_dir / "metadata.json").exists()
    assert (book_dir / "chapter_001.m4b").exists()
    assert (book_dir / "chapter_001_cues.json").exists()
    assert (book_dir / "chapter_001.html").exists()

    cues = json.loads((book_dir / "chapter_001_cues.json").read_text(encoding="utf-8"))
    assert len(cues) == 3
    assert cues[0]["text"] == "Chương 1: Khởi đầu mới"
    assert cues[1]["text"] == "Mặt trời lên cao."
    assert cues[2]["text"] == "Gió thổi nhè nhẹ."


def test_epub_preserves_spine_order(tmp_path):
    from ebooklib import epub
    from apps.web_reader.pipeline.generate_audiobook import extract_epub_chapters

    epub_file = tmp_path / "spine_test.epub"
    book = epub.EpubBook()
    book.set_identifier("spine-order-id")
    book.set_title("Spine Order Test")
    book.set_language("vi")

    c1 = epub.EpubHtml(title="Chương 1", file_name="c1.xhtml", lang="vi")
    c1.content = "<h1>Chương 1: Phần đầu</h1><p>Nội dung phần đầu.</p>"
    c2 = epub.EpubHtml(title="Chương 2", file_name="c2.xhtml", lang="vi")
    c2.content = "<h1>Chương 2: Phần sau</h1><p>Nội dung phần sau.</p>"

    # Add items to manifest in order c1, c2
    book.add_item(c1)
    book.add_item(c2)

    # Set spine in reverse order: c2 first, then c1
    book.spine = ["nav", (c2.get_id(), "yes"), (c1.get_id(), "yes")]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    epub.write_epub(str(epub_file), book, {})

    _, chapters = extract_epub_chapters(epub_file)
    assert len(chapters) == 2
    # Verify spine reading order is respected (c2 first, c1 second)
    assert chapters[0]["title"] == "Chương 2: Phần sau"
    assert chapters[1]["title"] == "Chương 1: Phần đầu"


def test_process_chapter_stitching_failure_handling(tmp_path):
    output_dir = tmp_path / "output_fail"
    output_dir.mkdir()
    ram_base = tmp_path / "shm"
    ram_base.mkdir()

    chapter = {
        "id": "chapter_001",
        "title": "Chương lỗi",
        "chapter_index": 1,
        "html": "<p>Nội dung thử nghiệm lỗi ghép audio.</p>",
    }

    tts = TTSEngine(dry_run=True)

    with patch("apps.web_reader.pipeline.generate_audiobook.stitch_to_m4b", return_value=False):
        result = process_chapter(
            chapter=chapter,
            output_dir=output_dir,
            tts=tts,
            ram_base_dir=ram_base,
            slug="test-fail",
        )

    assert result["status"] == "failed"
    assert result["error"] == "Audio stitching failed"

    # Should not write cues.json or chapter.html on stitching failure
    assert not (output_dir / "chapter_001_cues.json").exists()
    assert not (output_dir / "chapter_001.html").exists()


def test_cli_nonexistent_epub_exits_with_code_1():
    import subprocess
    import sys
    from pathlib import Path

    script = Path(__file__).resolve().parent.parent / "generate_audiobook.py"
    cmd = [sys.executable, str(script), "--epub", "nonexistent_file_xyz.epub"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 1
    assert "Input EPUB file not found" in res.stderr or "Input EPUB file not found" in res.stdout
    # Must not crash with NameError: name 'sys' is not defined
    assert "NameError" not in res.stderr



