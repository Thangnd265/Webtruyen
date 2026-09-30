"""Text file extractor for novel chapters (.txt).

Extracts novel metadata and chapters from raw .txt files,
matching the format of extract_epub_chapters().
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Tuple


CHAPTER_PATTERN = re.compile(
    r"(?im)^\s*(?:Chương|Hồi|Tiết|Mục|Bài|Chapter|Part)\s+(\d+|[IVXLCDM]+)(?:[\s:.\-–—]+(.*))?$",
    re.MULTILINE,
)


def _read_text_file(path: Path) -> str:
    """Reads a text file trying multiple common encodings, detecting declared charset first."""
    import unicodedata

    raw = path.read_bytes()

    # 1. Detect declared charset in HTML/XML header (e.g. charset=windows-1252 or charset=utf-8)
    header_sample = raw[:4096]
    match = re.search(rb'charset=["\']?([a-zA-Z0-9_\-]+)', header_sample, re.IGNORECASE)
    if match:
        declared = match.group(1).decode("ascii", errors="ignore").lower()
        charset_map = {
            "windows-1252": "windows-1252",
            "cp1252": "windows-1252",
            "iso-8859-1": "windows-1252",
            "latin1": "windows-1252",
            "utf-8": "utf-8",
            "utf8": "utf-8",
            "cp1258": "cp1258",
            "windows-1258": "cp1258",
        }
        codec = charset_map.get(declared)
        if codec:
            try:
                decoded = raw.decode(codec)
                return unicodedata.normalize("NFC", decoded)
            except Exception:
                pass

    # 2. Try common encodings: utf-8, utf-8-sig, windows-1252, utf-16, cp1258
    # Note: windows-1252 must precede cp1258 because Mobipocket/Kindle HTML files use windows-1252
    encodings = ["utf-8", "utf-8-sig", "windows-1252", "utf-16", "cp1258"]
    for enc in encodings:
        try:
            decoded = raw.decode(enc)
            return unicodedata.normalize("NFC", decoded)
        except (UnicodeDecodeError, LookupError):
            continue

    decoded = raw.decode("utf-8", errors="replace")
    return unicodedata.normalize("NFC", decoded)


def extract_txt_chapters(txt_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts book metadata and chapters from a .txt file.

    Returns:
        (metadata_info, chapters)
    """
    content = _read_text_file(txt_path)
    lines = content.splitlines()

    title = txt_path.stem.replace("_", " ").replace("-", " ").strip().title()
    author = "Unknown"
    description = ""

    # Look for metadata in the first 15 lines
    start_line_idx = 0
    for idx, line in enumerate(lines[:15]):
        line_clean = line.strip()
        if not line_clean:
            continue
        author_match = re.match(r"(?i)^(?:Tác giả|Author)\s*[:：\-]\s*(.*)$", line_clean)
        if author_match:
            author = author_match.group(1).strip()
            start_line_idx = max(start_line_idx, idx + 1)
            continue
        title_match = re.match(r"(?i)^(?:Tên truyện|Truyện|Title)\s*[:：\-]\s*(.*)$", line_clean)
        if title_match:
            title = title_match.group(1).strip()
            start_line_idx = max(start_line_idx, idx + 1)
            continue

    body_text = "\n".join(lines[start_line_idx:]).strip()

    # Find all chapter matches with their positions
    matches = list(CHAPTER_PATTERN.finditer(body_text))

    chapters: List[Dict[str, Any]] = []

    if matches:
        # Preamble before the first chapter (if any non-trivial text)
        first_start = matches[0].start()
        if first_start > 0:
            preamble = body_text[:first_start].strip()
            if len(preamble) > 100:
                description = preamble[:300] + ("..." if len(preamble) > 300 else "")

        for i, match in enumerate(matches):
            chapter_num = match.group(1)
            chapter_sub = (match.group(2) or "").strip()
            full_title = match.group(0).strip()

            start_pos = match.end()
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(body_text)

            chapter_content = body_text[start_pos:end_pos].strip()

            # Format into basic HTML paragraphs
            paragraphs = [p.strip() for p in chapter_content.split("\n") if p.strip()]
            html_content = "".join(f"<p>{p}</p>" for p in paragraphs)

            ch_index = i + 1
            chapters.append({
                "id": f"chapter_{ch_index:03d}",
                "title": full_title,
                "chapter_index": ch_index,
                "html": html_content or f"<p>{full_title}</p>",
            })
    else:
        # Single chapter story
        paragraphs = [p.strip() for p in body_text.split("\n") if p.strip()]
        html_content = "".join(f"<p>{p}</p>" for p in paragraphs)
        chapters.append({
            "id": "chapter_001",
            "title": f"Chương 1: {title}",
            "chapter_index": 1,
            "html": html_content or f"<p>{title}</p>",
        })

    metadata_info = {
        "title": title,
        "author": author,
        "description": description,
    }

    return metadata_info, chapters
