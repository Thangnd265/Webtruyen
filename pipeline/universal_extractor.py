"""Universal Ebook Extractor for Webtruyenv2.

Supports extraction of metadata, cover image, and chapters from all major ebook formats:
- .epub
- .prc, .mobi, .azw, .azw3 (Mobipocket / Kindle)
- .pdf (Portable Document Format)
- .docx (Microsoft Word)
- .fb2 (FictionBook)
- .txt, .md, .markdown (Plain text & Markdown)
- .html, .htm, .xhtml (Web documents)
"""

from __future__ import annotations

import base64
import logging
import re
import shutil
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from text_extractor import CHAPTER_PATTERN, _read_text_file, extract_txt_chapters
except ImportError:
    from pipeline.text_extractor import CHAPTER_PATTERN, _read_text_file, extract_txt_chapters

logger = logging.getLogger("universal_extractor")


def _clean_title(name: str) -> str:
    cleaned = name.replace("_", " ").replace("-", " ").strip().title()
    return cleaned or "Truyện Không Tên"


def extract_html_chapters(
    html_path: Path, title_fallback: Optional[str] = None
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts chapters from a standalone HTML file."""
    from bs4 import BeautifulSoup

    content = _read_text_file(html_path)
    soup = BeautifulSoup(content, "html.parser")

    title = title_fallback or _clean_title(html_path.stem)
    if soup.title and soup.title.get_text(strip=True):
        title = soup.title.get_text(strip=True)

    author = "Unknown"
    author_meta = soup.find("meta", attrs={"name": re.compile(r"author", re.I)})
    if author_meta and author_meta.get("content"):
        author = str(author_meta["content"]).strip()

    # Look for headings to split chapters
    headings = soup.find_all(["h1", "h2", "h3"])
    chapters: List[Dict[str, Any]] = []

    if headings:
        for idx, h in enumerate(headings):
            ch_title = h.get_text(strip=True) or f"Chương {idx + 1}"
            ch_index = idx + 1
            # Gather sibling elements until next heading
            paras = []
            curr = h.next_sibling
            while curr and getattr(curr, "name", None) not in ["h1", "h2", "h3"]:
                if hasattr(curr, "get_text"):
                    t = curr.get_text(strip=True)
                    if t:
                        paras.append(f"<p>{t}</p>")
                curr = curr.next_sibling

            chapters.append({
                "id": f"chapter_{ch_index:03d}",
                "title": ch_title,
                "chapter_index": ch_index,
                "html": "".join(paras) or f"<p>{ch_title}</p>",
            })
    else:
        # Fallback to text parsing
        text_content = soup.get_text("\n", strip=True)
        temp_txt = html_path.with_suffix(".temp.txt")
        temp_txt.write_text(f"Tên truyện: {title}\n\n" + text_content, encoding="utf-8")
        try:
            return extract_txt_chapters(temp_txt)
        finally:
            temp_txt.unlink(missing_ok=True)

    metadata_info = {"title": title, "author": author, "description": ""}
    return metadata_info, chapters


def extract_mobi_prc_chapters(file_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts chapters from .mobi, .prc, .azw, .azw3 files via mobi library."""
    import mobi
    try:
        from generate_audiobook import extract_epub_chapters
    except ImportError:
        from pipeline.generate_audiobook import extract_epub_chapters

    tempdir, extracted_path = mobi.extract(str(file_path))
    temp_p = Path(tempdir)
    extracted = Path(extracted_path)

    try:
        if extracted.suffix.lower() == ".epub":
            meta, chapters = extract_epub_chapters(extracted)
        elif extracted.suffix.lower() in [".html", ".htm"]:
            meta, chapters = extract_html_chapters(extracted, title_fallback=_clean_title(file_path.stem))
        else:
            raise ValueError(f"Unrecognized unpacked mobi format: {extracted.name}")

        # Set title fallback if empty
        if not meta.get("title") or meta.get("title") == extracted.stem:
            meta["title"] = _clean_title(file_path.stem)

        return meta, chapters
    finally:
        shutil.rmtree(temp_p, ignore_errors=True)


def extract_pdf_chapters(pdf_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts chapters and text from .pdf files using PyMuPDF."""
    import pymupdf

    doc = pymupdf.open(str(pdf_path))
    meta_dict = doc.metadata or {}

    title = meta_dict.get("title") or _clean_title(pdf_path.stem)
    author = meta_dict.get("author") or "Unknown"

    metadata_info: Dict[str, Any] = {
        "title": title,
        "author": author,
        "description": meta_dict.get("subject", ""),
    }

    # Extract first page as cover if doc has pages
    if len(doc) > 0:
        try:
            first_page = doc[0]
            pix = first_page.get_pixmap(dpi=150)
            metadata_info["cover_bytes"] = pix.tobytes("jpeg")
            metadata_info["cover_filename"] = "cover.jpg"
        except Exception as e:
            logger.warning(f"Could not render PDF cover: {e}")

    # Check for PDF bookmarks / Table of Contents
    toc = doc.get_toc()  # [[lvl, title, page], ...]
    chapters: List[Dict[str, Any]] = []

    if toc and len(toc) > 1:
        for idx, entry in enumerate(toc):
            lvl, ch_title, start_page = entry
            end_page = toc[idx + 1][2] - 1 if idx + 1 < len(toc) else len(doc)
            start_page = max(1, start_page)
            end_page = max(start_page, min(len(doc), end_page))

            pages_text = []
            for p_num in range(start_page - 1, end_page):
                p_text = doc[p_num].get_text().strip()
                if p_text:
                    pages_text.append(p_text)

            combined_text = "\n\n".join(pages_text)
            paragraphs = [p.strip() for p in combined_text.split("\n\n") if p.strip()]
            html = "".join(f"<p>{p}</p>" for p in paragraphs) or f"<p>{ch_title}</p>"

            ch_index = idx + 1
            chapters.append({
                "id": f"chapter_{ch_index:03d}",
                "title": ch_title,
                "chapter_index": ch_index,
                "html": html,
            })
    else:
        # No TOC in PDF: extract all text and run regex chapter finder
        all_pages = [doc[i].get_text() for i in range(len(doc))]
        full_text = "\n".join(all_pages)

        temp_txt = pdf_path.with_suffix(".temp.txt")
        temp_txt.write_text(f"Tên truyện: {title}\nTác giả: {author}\n\n" + full_text, encoding="utf-8")
        try:
            extracted_meta, chapters = extract_txt_chapters(temp_txt)
            if "cover_bytes" in metadata_info:
                extracted_meta["cover_bytes"] = metadata_info["cover_bytes"]
                extracted_meta["cover_filename"] = metadata_info["cover_filename"]
            return extracted_meta, chapters
        finally:
            temp_txt.unlink(missing_ok=True)

    doc.close()
    return metadata_info, chapters


def extract_docx_chapters(docx_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts text and chapters from a .docx file using standard library zipfile + XML."""
    title = _clean_title(docx_path.stem)
    author = "Unknown"
    description = ""
    cover_bytes = None

    with zipfile.ZipFile(docx_path) as z:
        # Extract cover if there are images
        media_files = [f for f in z.namelist() if f.startswith("word/media/")]
        if media_files:
            # First image is often the cover
            cover_bytes = z.read(sorted(media_files)[0])

        xml_content = z.read("word/document.xml")

    root = ET.fromstring(xml_content)
    namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    paragraphs = []
    for p in root.iterfind(".//w:p", namespaces):
        texts = [node.text for node in p.iterfind(".//w:t", namespaces) if node.text]
        if texts:
            paragraphs.append("".join(texts).strip())

    body_text = "\n\n".join(paragraphs)

    temp_txt = docx_path.with_suffix(".temp.txt")
    temp_txt.write_text(f"Tên truyện: {title}\n\n" + body_text, encoding="utf-8")
    try:
        metadata_info, chapters = extract_txt_chapters(temp_txt)
        if cover_bytes:
            metadata_info["cover_bytes"] = cover_bytes
            metadata_info["cover_filename"] = "cover.jpg"
        return metadata_info, chapters
    finally:
        temp_txt.unlink(missing_ok=True)


def extract_fb2_chapters(fb2_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts metadata and chapters from FictionBook2 (.fb2) XML."""
    import warnings
    from bs4 import BeautifulSoup

    content = _read_text_file(fb2_path)
    try:
        from bs4 import XMLParsedAsHTMLWarning
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
            soup = BeautifulSoup(content, "html.parser")
    except ImportError:
        soup = BeautifulSoup(content, "html.parser")

    title_elem = soup.find("book-title")
    title = title_elem.get_text(strip=True) if title_elem else _clean_title(fb2_path.stem)

    author = "Unknown"
    author_elem = soup.find("author")
    if author_elem:
        first = author_elem.find("first-name")
        last = author_elem.find("last-name")
        parts = [p.get_text(strip=True) for p in [first, last] if p and p.get_text(strip=True)]
        if parts:
            author = " ".join(parts)

    desc_elem = soup.find("annotation")
    description = desc_elem.get_text(strip=True) if desc_elem else ""

    metadata_info: Dict[str, Any] = {
        "title": title,
        "author": author,
        "description": description,
    }

    # Extract binary cover
    cover_elem = soup.find("coverpage")
    if cover_elem:
        img = cover_elem.find("image")
        if img and img.get("l:href"):
            cover_id = img["l:href"].lstrip("#")
            binary = soup.find("binary", id=cover_id)
            if binary and binary.string:
                try:
                    metadata_info["cover_bytes"] = base64.b64decode(binary.string.strip())
                    metadata_info["cover_filename"] = "cover.jpg"
                except Exception:
                    pass

    # Extract sections
    sections = soup.find_all("section")
    chapters: List[Dict[str, Any]] = []

    if sections:
        for idx, sec in enumerate(sections):
            t_elem = sec.find("title")
            ch_title = t_elem.get_text(strip=True) if t_elem else f"Chương {idx + 1}"
            ch_index = idx + 1

            paras = [f"<p>{p.get_text(strip=True)}</p>" for p in sec.find_all("p") if p.get_text(strip=True)]
            html = "".join(paras) or f"<p>{ch_title}</p>"

            chapters.append({
                "id": f"chapter_{ch_index:03d}",
                "title": ch_title,
                "chapter_index": ch_index,
                "html": html,
            })
    else:
        # Fallback to all <p>
        paras = [f"<p>{p.get_text(strip=True)}</p>" for p in soup.find_all("p") if p.get_text(strip=True)]
        chapters.append({
            "id": "chapter_001",
            "title": f"Chương 1: {title}",
            "chapter_index": 1,
            "html": "".join(paras) or f"<p>{title}</p>",
        })

    return metadata_info, chapters


def extract_book_chapters(file_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Universal router that inspects file extension and extracts book metadata and chapters.

    Supported formats:
    - .epub
    - .prc, .mobi, .azw, .azw3
    - .pdf
    - .docx
    - .fb2
    - .txt, .md, .markdown
    - .html, .htm, .xhtml
    """
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    ext = path.suffix.lower()

    if ext == ".epub":
        try:
            from generate_audiobook import extract_epub_chapters
        except ImportError:
            from pipeline.generate_audiobook import extract_epub_chapters
        return extract_epub_chapters(path)

    elif ext in [".prc", ".mobi", ".azw", ".azw3"]:
        return extract_mobi_prc_chapters(path)

    elif ext == ".pdf":
        return extract_pdf_chapters(path)

    elif ext == ".docx":
        return extract_docx_chapters(path)

    elif ext == ".fb2":
        return extract_fb2_chapters(path)

    elif ext in [".txt", ".md", ".markdown"]:
        return extract_txt_chapters(path)

    elif ext in [".html", ".htm", ".xhtml"]:
        return extract_html_chapters(path)

    else:
        raise ValueError(
            f"Unsupported format '{ext}'. Supported formats: .epub, .prc, .mobi, .azw, .azw3, .pdf, .docx, .fb2, .txt, .md, .html"
        )
