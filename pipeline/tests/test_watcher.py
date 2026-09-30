import os
import time
from pathlib import Path
import pytest

try:
    from pipeline.watcher import is_file_ready, run_watch_cycle
except ImportError:
    from watcher import is_file_ready, run_watch_cycle


def test_is_file_ready(tmp_path: Path):
    empty_file = tmp_path / "empty.txt"
    empty_file.touch()
    assert is_file_ready(empty_file, check_delay=0.1) is False

    valid_file = tmp_path / "valid.txt"
    valid_file.write_text("Hello world", encoding="utf-8")
    assert is_file_ready(valid_file, check_delay=0.1) is True


def test_watch_cycle_processes_txt_file(tmp_path: Path):
    watch_dir = tmp_path / "incoming"
    output_dir = tmp_path / "web_audiobooks"
    done_dir = watch_dir / "done"
    failed_dir = watch_dir / "failed"

    watch_dir.mkdir(parents=True, exist_ok=True)

    # Create incoming novel
    novel_txt = watch_dir / "tinh_mong.txt"
    novel_txt.write_text(
        """Tên truyện: Tỉnh Mộng
Tác giả: Lạc Diệp

Chương 1: Bình minh
Mặt trời bắt đầu nhô lên khỏi rặng núi phía đông. Không khí se lạnh.

Chương 2: Lên đường
Hắn thu dọn hành lý, cầm lấy thanh bảo kiếm rồi bước ra khỏi cửa.
""",
        encoding="utf-8",
    )

    count = run_watch_cycle(
        watch_dir=watch_dir,
        output_dir=output_dir,
        done_dir=done_dir,
        failed_dir=failed_dir,
        voice="Hải Đăng",
        dry_run=True,
    )

    assert count == 1
    # Check that original file was moved out of watch_dir into done_dir
    assert not novel_txt.exists()
    done_files = list(done_dir.glob("*_tinh_mong.txt"))
    assert len(done_files) == 1

    # Check generated book in output_dir
    book_dir = output_dir / "tinh-mong"
    assert book_dir.exists()
    assert (book_dir / "metadata.json").exists()
    assert (book_dir / "chapter_001.m4b").exists()
    assert (book_dir / "chapter_001_cues.json").exists()
    assert (book_dir / "chapter_001.html").exists()
    assert (book_dir / "chapter_002.m4b").exists()


def test_watch_cycle_ignores_hidden_and_unsupported(tmp_path: Path):
    watch_dir = tmp_path / "incoming"
    output_dir = tmp_path / "web_audiobooks"
    done_dir = watch_dir / "done"
    failed_dir = watch_dir / "failed"

    watch_dir.mkdir(parents=True, exist_ok=True)

    (watch_dir / ".hidden.txt").write_text("Hidden", encoding="utf-8")
    (watch_dir / "data.csv").write_text("col1,col2\n1,2", encoding="utf-8")

    count = run_watch_cycle(
        watch_dir=watch_dir,
        output_dir=output_dir,
        done_dir=done_dir,
        failed_dir=failed_dir,
        dry_run=True,
    )

    assert count == 0
    assert (watch_dir / ".hidden.txt").exists()
    assert (watch_dir / "data.csv").exists()
