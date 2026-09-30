#!/usr/bin/env python3
"""Syncs all text, metadata, cues, and covers from Google Drive to local SSD on CT 301."""

import os
import shutil
from pathlib import Path

def sync_text(source_dir: Path, target_dir: Path):
    if not source_dir.exists():
        print(f"Source dir {source_dir} does not exist.")
        return

    target_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    total_bytes = 0

    valid_extensions = {".html", ".htm", ".json", ".jpg", ".jpeg", ".png", ".webp"}

    for book_folder in source_dir.iterdir():
        if not book_folder.is_dir() or book_folder.name.startswith(".") or book_folder.name in ("incoming_books", "lost+found", "voices", "models"):
            continue

        dest_book_folder = target_dir / book_folder.name
        dest_book_folder.mkdir(parents=True, exist_ok=True)

        for item in book_folder.iterdir():
            if item.is_file() and item.suffix.lower() in valid_extensions:
                dest_file = dest_book_folder / item.name
                # Copy if not exists or if size/mtime differs
                try:
                    src_stat = item.stat()
                    if not dest_file.exists() or dest_file.stat().st_size != src_stat.st_size:
                        shutil.copy2(item, dest_file)
                        count += 1
                        total_bytes += src_stat.st_size
                except Exception as e:
                    print(f"Error copying {item}: {e}")

    print(f"Sync complete! Copied/Updated {count} files ({total_bytes / (1024*1024):.2f} MB).")
    print(f"Target location: {target_dir}")

if __name__ == "__main__":
    src = Path(os.environ.get("AUDIOBOOKS_DIR", "/mnt/gdrive/audiobooks"))
    dst = Path(os.environ.get("LOCAL_DATA_DIR", "/var/lib/webtruyen/books"))
    sync_text(src, dst)
