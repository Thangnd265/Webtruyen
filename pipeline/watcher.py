"""Automatic Folder Watcher for Webtruyenv2.

Monitors an incoming directory (e.g., incoming_books/), detects new .epub/.txt files,
automatically converts them using the VieNeu-TTS pipeline, and publishes them
directly to the web reader audiobooks directory.
"""

from __future__ import annotations

import argparse
import datetime
import logging
import os
import shutil
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

pipeline_dir = Path(__file__).resolve().parent
root_dir = pipeline_dir.parent
for p in [str(pipeline_dir), str(root_dir), str(root_dir / "backend")]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from config import settings
except ImportError:
    try:
        from backend.config import settings
    except ImportError:
        settings = None

try:
    from generate_audiobook import generate_audiobook, slugify
    from universal_extractor import extract_book_chapters
except ImportError:
    from pipeline.generate_audiobook import generate_audiobook, slugify
    from pipeline.universal_extractor import extract_book_chapters

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("book_watcher")

SUPPORTED_EXTENSIONS = {
    ".epub",
    ".prc",
    ".mobi",
    ".azw",
    ".azw3",
    ".pdf",
    ".docx",
    ".fb2",
    ".txt",
    ".md",
    ".markdown",
    ".html",
    ".htm",
    ".xhtml",
}


def get_default_output_dir() -> Path:
    """Resolves default target directory where web reader discovers audiobooks."""
    if settings and hasattr(settings, "AUDIOBOOKS_DIR"):
        configured = Path(settings.AUDIOBOOKS_DIR)
        if configured.exists() or os.name != "nt":
            return configured
    # Fallback to local samples folder if on Windows or default path does not exist
    local_samples = pipeline_dir.parent / "samples"
    if local_samples.exists():
        return local_samples
    return Path("/mnt/gdrive/audiobooks")


def is_file_ready(file_path: Path, check_delay: float = 1.5) -> bool:
    """Checks whether a file has finished copying and is readable."""
    try:
        if not file_path.is_file():
            return False
        initial_size = file_path.stat().st_size
        if initial_size == 0:
            return False
        time.sleep(check_delay)
        new_size = file_path.stat().st_size
        if initial_size != new_size:
            return False
        # Try opening for read
        with open(file_path, "rb") as f:
            f.read(1024)
        return True
    except (OSError, PermissionError):
        return False


def process_incoming_file(
    file_path: Path,
    output_dir: Path,
    done_dir: Path,
    failed_dir: Path,
    voice: str = "Ngọc Huyền",
    dry_run: bool = False,
    bitrate: str = "64k",
    max_chapters: Optional[int] = None,
    skip_existing: bool = True,
    model_dir: Optional[str] = None,
) -> bool:
    """Processes a single novel file and moves it to done/ or failed/."""
    logger.info(f"📂 Phát hiện file truyện mới: {file_path.name} ({file_path.stat().st_size / 1024:.1f} KB)")
    ext = file_path.suffix.lower()
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    try:
        metadata_info, chapters = extract_book_chapters(file_path)

        if not chapters:
            raise ValueError("Không tìm thấy chương truyện nào trong file.")

        title = metadata_info.get("title", file_path.stem)
        slug = slugify(title)
        num_ch = len(chapters) if max_chapters is None else min(len(chapters), max_chapters)
        logger.info(f"📖 Bắt đầu chuyển đổi: '{title}' ({num_ch}/{len(chapters)} chương) với giọng đọc '{voice}'...")

        generate_audiobook(
            slug=slug,
            output_base_dir=output_dir,
            chapters=chapters,
            metadata_info=metadata_info,
            voice=voice,
            bitrate=bitrate,
            dry_run=dry_run,
            skip_existing=skip_existing,
            max_chapters=max_chapters,
            model_path=model_dir,
        )

        # Move to done
        done_dir.mkdir(parents=True, exist_ok=True)
        dest_done = done_dir / f"{ts}_{file_path.name}"
        shutil.move(str(file_path), str(dest_done))

        logger.info(f"🎉 Chuyển đổi thành công! Truyện '{title}' đã được cập nhật lên Web tại thư mục: {output_dir / slug}")
        logger.info(f"📦 Đã chuyển file gốc vào: {dest_done.name}")
        return True

    except Exception as exc:
        err_msg = traceback.format_exc()
        logger.error(f"❌ Lỗi khi xử lý file '{file_path.name}': {exc}")

        failed_dir.mkdir(parents=True, exist_ok=True)
        dest_failed = failed_dir / f"{ts}_{file_path.name}"
        error_log = failed_dir / f"{ts}_{file_path.stem}_error.log"

        try:
            shutil.move(str(file_path), str(dest_failed))
            error_log.write_text(err_msg, encoding="utf-8")
            logger.info(f"⚠️ Đã di chuyển file lỗi sang: {dest_failed.name} kèm file log.")
        except Exception as move_err:
            logger.error(f"Không thể di chuyển file lỗi: {move_err}")

        return False


def run_watch_cycle(
    watch_dir: Path,
    output_dir: Path,
    done_dir: Path,
    failed_dir: Path,
    voice: str = "Ngọc Huyền",
    dry_run: bool = False,
    bitrate: str = "64k",
    max_chapters: Optional[int] = None,
    skip_existing: bool = True,
    model_dir: Optional[str] = None,
) -> int:
    """Scans watch_dir once for new files and processes them. Returns number of files processed."""
    watch_dir.mkdir(parents=True, exist_ok=True)
    done_dir.mkdir(parents=True, exist_ok=True)
    failed_dir.mkdir(parents=True, exist_ok=True)

    items = sorted(watch_dir.iterdir(), key=lambda p: p.name)
    processed_count = 0

    for item in items:
        # Ignore subdirectories (e.g. done, failed) and temporary/hidden files
        if not item.is_file():
            continue
        if (
            item.name.startswith((".", "~"))
            or item.stem.lower() == "readme"
            or item.suffix.lower() not in SUPPORTED_EXTENSIONS
        ):
            continue

        if is_file_ready(item):
            process_incoming_file(
                file_path=item,
                output_dir=output_dir,
                done_dir=done_dir,
                failed_dir=failed_dir,
                voice=voice,
                dry_run=dry_run,
                bitrate=bitrate,
                max_chapters=max_chapters,
                skip_existing=skip_existing,
                model_dir=model_dir,
            )
            processed_count += 1

    return processed_count


def start_watcher(
    watch_dir: Path,
    output_dir: Path,
    voice: str = "Ngọc Huyền",
    poll_interval: int = 5,
    dry_run: bool = False,
    bitrate: str = "64k",
    once: bool = False,
    max_chapters: Optional[int] = None,
    skip_existing: bool = True,
    model_dir: Optional[str] = None,
) -> None:
    """Runs the main monitoring loop."""
    done_dir = watch_dir / "done"
    failed_dir = watch_dir / "failed"

    logger.info("=" * 60)
    logger.info("🚀 WEBTUYENV2 AUTO FOLDER WATCHER ĐÃ KHỞI CHẠY")
    logger.info(f"📂 Thư mục giám sát: {watch_dir.resolve()}")
    logger.info(f"🌐 Thư mục web đích: {output_dir.resolve()}")
    logger.info(f"🎙️ Giọng đọc mặc định: {voice}")
    if model_dir:
        logger.info(f"🧠 LoRA/Custom Model Repo: {model_dir}")
    logger.info(f"⏱️ Chu kỳ kiểm tra: {poll_interval}s")
    if max_chapters:
        logger.info(f"🔢 Giới hạn chương mỗi truyện: {max_chapters}")
    if not skip_existing:
        logger.info("⚡ Chế độ FORCE: Ghi đè âm thanh các chương đã tồn tại")
    if dry_run:
        logger.info("🧪 Chế độ DRY-RUN: Bật (mô phỏng không tải GPU)")
    logger.info("=" * 60)
    logger.info("👉 HƯỚNG DẪN: Chỉ cần copy/thả file .epub hoặc .txt vào thư mục trên, hệ thống sẽ tự động làm tất cả!")

    try:
        while True:
            run_watch_cycle(
                watch_dir=watch_dir,
                output_dir=output_dir,
                done_dir=done_dir,
                failed_dir=failed_dir,
                voice=voice,
                dry_run=dry_run,
                bitrate=bitrate,
                max_chapters=max_chapters,
                skip_existing=skip_existing,
                model_dir=model_dir,
            )
            if once:
                break
            time.sleep(poll_interval)
    except KeyboardInterrupt:
        logger.info("\n🛑 Đã dừng tiến trình Auto Folder Watcher.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Webtruyenv2 Auto Folder Watcher")
    parser.add_argument(
        "--watch-dir",
        type=str,
        default="incoming_books",
        help="Directory to watch for incoming novels (default: incoming_books)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Target audiobooks directory for web reader (default: auto from settings)",
    )
    parser.add_argument(
        "--voice",
        type=str,
        default="Ngọc Huyền",
        help="TTS Voice preset or reference audio path (default: 'Ngọc Huyền')",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Polling interval in seconds (default: 5)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate audio synthesis without calling VieNeu neural models",
    )
    parser.add_argument(
        "--bitrate",
        type=str,
        default="64k",
        help="Audio bitrate (default: 64k)",
    )
    parser.add_argument(
        "--max-chapters",
        type=int,
        default=None,
        help="Limit number of chapters to process per book",
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default=None,
        help="Path to fine-tuned merged LoRA model directory",
    )
    parser.add_argument(
        "--force",
        "--no-skip-existing",
        dest="skip_existing",
        action="store_false",
        default=True,
        help="Force re-generation of audio even if chapters already exist",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single scan cycle and exit",
    )

    args = parser.parse_args()

    watch_path = Path(args.watch_dir).resolve()
    out_path = Path(args.output_dir).resolve() if args.output_dir else get_default_output_dir()

    start_watcher(
        watch_dir=watch_path,
        output_dir=out_path,
        voice=args.voice,
        poll_interval=args.interval,
        dry_run=args.dry_run,
        bitrate=args.bitrate,
        once=args.once,
        max_chapters=args.max_chapters,
        skip_existing=args.skip_existing,
        model_dir=args.model_dir,
    )


if __name__ == "__main__":
    main()
