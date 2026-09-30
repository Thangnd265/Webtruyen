"""VieNeu-TTS v3 RAM-Based Audiobook Generator.

Generates audiobook chapters (.m4b) with sentence-level timestamps (cues.json)
using RAM Disk (/dev/shm) for zero local SSD usage.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import uuid
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

pipeline_dir = Path(__file__).resolve().parent
if str(pipeline_dir) not in sys.path:
    sys.path.insert(0, str(pipeline_dir))

try:
    from apps.web_reader.pipeline.text_splitter import format_cues_html, split_into_cues
    from apps.web_reader.pipeline.universal_extractor import extract_book_chapters
except ImportError:
    try:
        from pipeline.text_splitter import format_cues_html, split_into_cues
        from pipeline.universal_extractor import extract_book_chapters
    except ImportError:
        from text_splitter import format_cues_html, split_into_cues
        from universal_extractor import extract_book_chapters

logger = logging.getLogger("audiobook_pipeline")
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")


def get_default_ram_dir() -> Path:
    """Returns /dev/shm if present and writable, else tempfile.gettempdir()."""
    shm = Path("/dev/shm")
    if shm.is_dir() and os.access(str(shm), os.W_OK):
        return shm
    return Path(tempfile.gettempdir())


def slugify(text: str) -> str:
    """Converts a Vietnamese title or string into a URL/directory friendly slug."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", text)


def get_wav_duration(wav_path: Path) -> float:
    """Reads exact duration in seconds from a WAV file header using stdlib wave."""
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        if rate == 0:
            return 0.0
        return round(frames / float(rate), 3)


class TTSEngine:
    """TTS Synthesizer wrapper supporting VieNeu-TTS v3 neural synthesis and mock mode."""

    def __init__(
        self,
        voice: str = "vie_neu_v3_female",
        dry_run: bool = False,
        model_path: Optional[str] = None,
    ) -> None:
        self.voice = voice
        self.dry_run = dry_run
        self.model_path = model_path
        self._model = None

        if not self.dry_run:
            self._init_real_model()

    def _init_real_model(self) -> None:
        try:
            from vieneu import Vieneu

            logger.info("VieNeu-TTS v3 engine successfully loaded.")
            self._model = Vieneu()
        except ImportError:
            logger.warning(
                "VieNeu-TTS ('vieneu') is not installed. Real synthesis will fail unless dry_run=True."
            )

    def synthesize_sentence(self, text: str, output_wav_path: Path) -> float:
        """Synthesizes text into a WAV file at output_wav_path. Returns duration in seconds."""
        if self.dry_run:
            return self._mock_synthesize(text, output_wav_path)
        return self._real_synthesize(text, output_wav_path)

    def _mock_synthesize(self, text: str, output_wav_path: Path) -> float:
        """Generates a valid PCM WAV file with duration proportional to word count."""
        words = len(text.split())
        duration = round(max(0.6, words * 0.25), 3)
        framerate = 24000
        num_frames = int(framerate * duration)

        with wave.open(str(output_wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(framerate)
            wf.writeframes(b"\x00\x00" * num_frames)

        return duration

    def _real_synthesize(self, text: str, output_wav_path: Path) -> float:
        """Synthesizes text using VieNeu-TTS v3 model."""
        if self._model is None:
            raise RuntimeError(
                "VieNeu-TTS engine is not available. Please install 'vieneu' or use --dry-run."
            )
        audio = self._model.infer(text, voice=self.voice)
        self._model.save(audio, str(output_wav_path))
        return get_wav_duration(output_wav_path)


def stitch_to_m4b(
    wav_files: List[Path],
    output_m4b_path: Path,
    ram_dir: Path,
    bitrate: str = "64k",
) -> bool:
    """Concatenates individual WAV files into an optimized .m4b (AAC) audio file."""
    if not wav_files:
        logger.warning("No WAV files to stitch.")
        return False

    ffmpeg_bin = shutil.which("ffmpeg")

    if ffmpeg_bin:
        concat_file = ram_dir / f"concat_{uuid.uuid4().hex[:6]}.txt"
        lines = [f"file '{p.resolve().as_posix()}'\n" for p in wav_files]
        concat_file.write_text("".join(lines), encoding="utf-8")

        cmd = [
            ffmpeg_bin,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c:a",
            "aac",
            "-b:a",
            bitrate,
            str(output_m4b_path),
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if concat_file.exists():
            concat_file.unlink(missing_ok=True)

        if result.returncode != 0:
            logger.error(f"FFmpeg failed with return code {result.returncode}: {result.stderr.decode('utf-8', errors='ignore')}")
            return False
        return True
    else:
        # Fallback for environments / test systems without ffmpeg binary
        logger.warning("FFmpeg binary not found in PATH; writing simulated audio file for testing.")
        with open(output_m4b_path, "wb") as out:
            for w in wav_files:
                if w.exists():
                    out.write(w.read_bytes())
        return True


def process_chapter(
    chapter: Dict[str, Any],
    output_dir: Path,
    tts: TTSEngine,
    ram_base_dir: Optional[Path] = None,
    slug: str = "audiobook",
    bitrate: str = "64k",
    skip_existing: bool = True,
    voice_tag: Optional[str] = None,
) -> Dict[str, Any]:
    """Processes a single chapter: splits text, runs TTS in RAM, stitches m4b, and saves cues."""
    chapter_id = chapter["id"]
    output_dir.mkdir(parents=True, exist_ok=True)

    tag_suffix = f"_{voice_tag}" if voice_tag else ""
    m4b_path = output_dir / f"{chapter_id}{tag_suffix}.m4b"
    cues_path = output_dir / f"{chapter_id}{tag_suffix}_cues.json"
    html_path = output_dir / f"{chapter_id}.html"

    # Chapter resume capability
    if skip_existing and m4b_path.exists() and m4b_path.stat().st_size > 0 and cues_path.exists():
        logger.info(f"Chapter {chapter_id} already exists in {output_dir}. Skipping (resume).")
        return {"status": "skipped", "chapter_id": chapter_id}

    if ram_base_dir is None:
        ram_base_dir = get_default_ram_dir()

    # Create temporary batch directory strictly in RAM Disk
    batch_ram_dir = ram_base_dir / f"tts_batch_{slug}_{chapter_id}_{uuid.uuid4().hex[:8]}"
    batch_ram_dir.mkdir(parents=True, exist_ok=True)

    try:
        raw_html = chapter.get("html", "")
        cues_raw = split_into_cues(raw_html)
        if not cues_raw:
            logger.warning(f"Chapter {chapter_id} has no text to synthesize.")
            return {"status": "empty", "chapter_id": chapter_id}

        wav_files: List[Path] = []
        final_cues: List[Dict[str, Any]] = []
        current_time: float = 0.0

        for cue in cues_raw:
            cue_id = cue["id"]
            sentence_text = cue["text"]
            wav_path = batch_ram_dir / f"{cue_id}.wav"

            tts.synthesize_sentence(sentence_text, wav_path)
            duration = get_wav_duration(wav_path)

            start = round(current_time, 3)
            end = round(current_time + duration, 3)
            current_time = end

            final_cues.append({
                "id": cue_id,
                "start": start,
                "end": end,
                "text": sentence_text,
            })
            wav_files.append(wav_path)

        # Stitch all individual sentence WAVs into chapter .m4b
        stitch_success = stitch_to_m4b(wav_files, m4b_path, ram_dir=batch_ram_dir, bitrate=bitrate)
        if not stitch_success:
            logger.error(f"Failed to stitch audio for chapter {chapter_id}.")
            return {
                "status": "failed",
                "chapter_id": chapter_id,
                "error": "Audio stitching failed",
            }

        # Write exact sentence timing cues
        cues_path.write_text(json.dumps(final_cues, ensure_ascii=False, indent=2), encoding="utf-8")

        # Write chapter HTML with cue IDs and timing metadata
        html_markup = format_cues_html(final_cues)
        html_path.write_text(html_markup, encoding="utf-8")

        logger.info(
            f"Successfully processed {chapter_id}: {len(final_cues)} cues, {current_time:.2f}s total audio."
        )

        return {
            "status": "processed",
            "chapter_id": chapter_id,
            "cue_count": len(final_cues),
            "total_duration": current_time,
        }

    finally:
        # Guarantee 0 MB local SSD / RAM leak by purging all temporary batch files
        if batch_ram_dir.exists():
            shutil.rmtree(batch_ram_dir, ignore_errors=True)


def extract_epub_chapters(epub_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts book metadata, cover, and document chapters from an EPUB file."""
    import ebooklib  # type: ignore
    from bs4 import BeautifulSoup
    from ebooklib import epub  # type: ignore

    book = epub.read_epub(str(epub_path))

    title_meta = book.get_metadata("DC", "title")
    title = title_meta[0][0] if title_meta else epub_path.stem

    creator_meta = book.get_metadata("DC", "creator")
    author = creator_meta[0][0] if creator_meta else "Unknown"

    desc_meta = book.get_metadata("DC", "description")
    description = desc_meta[0][0] if desc_meta else ""

    metadata_info = {
        "title": title,
        "author": author,
        "description": description,
    }

    # Extract cover image if present
    cover_item = None
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_COVER or (
            item.get_type() == ebooklib.ITEM_IMAGE and "cover" in item.get_name().lower()
        ):
            cover_item = item
            break

    if cover_item:
        metadata_info["cover_bytes"] = cover_item.get_content()
        metadata_info["cover_filename"] = Path(cover_item.get_name()).name

    chapters: List[Dict[str, Any]] = []
    chapter_index = 1

    # Extract HTML document items according to EPUB spine reading order
    document_items = []
    if getattr(book, "spine", None):
        for spine_entry in book.spine:
            item_id = spine_entry[0] if isinstance(spine_entry, (tuple, list)) else spine_entry
            item = book.get_item_with_id(item_id)
            if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
                document_items.append(item)

    # Fallback to manifest order if spine is empty or has no document items
    if not document_items:
        document_items = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

    for item in document_items:
        content = item.get_content().decode("utf-8", errors="ignore")
        soup = BeautifulSoup(content, "html.parser")
        text = soup.get_text(strip=True)

        # Ignore tiny non-content items (e.g. toc, nav, title page)
        if len(text) < 40 and not soup.find(["p", "article"]):
            continue

        heading = soup.find(["h1", "h2", "h3"])
        chapter_title = heading.get_text(strip=True) if heading else f"Chương {chapter_index}"

        chapters.append({
            "id": f"chapter_{chapter_index:03d}",
            "title": chapter_title,
            "chapter_index": chapter_index,
            "html": content,
        })
        chapter_index += 1

    return metadata_info, chapters


def generate_audiobook(
    slug: str,
    output_base_dir: Path,
    chapters: List[Dict[str, Any]],
    metadata_info: Dict[str, Any],
    voice: str = "vie_neu_v3_female",
    ram_dir: Optional[Path] = None,
    bitrate: str = "64k",
    dry_run: bool = False,
    skip_existing: bool = True,
    max_chapters: Optional[int] = None,
    model_path: Optional[str] = None,
    voice_tag: Optional[str] = None,
) -> Dict[str, Any]:
    """Generates complete audiobook directly to target output directory."""
    target_book_dir = output_base_dir / slug
    target_book_dir.mkdir(parents=True, exist_ok=True)

    if ram_dir is None:
        ram_dir = get_default_ram_dir()

    tts = TTSEngine(voice=voice, dry_run=dry_run)

    # Save cover if present
    if "cover_bytes" in metadata_info:
        cover_path = target_book_dir / "cover.jpg"
        cover_path.write_bytes(metadata_info["cover_bytes"])

    # Process chapters
    processed_chapters = []
    active_chapters = chapters[:max_chapters] if max_chapters else chapters

    for ch in active_chapters:
        res = process_chapter(
            chapter=ch,
            output_dir=target_book_dir,
            tts=tts,
            ram_base_dir=ram_dir,
            slug=slug,
            bitrate=bitrate,
            skip_existing=skip_existing,
            voice_tag=voice_tag,
        )
        processed_chapters.append(res)

    # Build and save metadata.json directly in target output dir
    book_metadata = {
        "title": metadata_info.get("title", slug),
        "author": metadata_info.get("author", "Unknown"),
        "description": metadata_info.get("description", ""),
        "slug": slug,
        "cover_url": f"/api/books/{slug}/cover" if (target_book_dir / "cover.jpg").exists() else None,
        "total_chapters": len(active_chapters),
        "chapters": [
            {
                "id": ch["id"],
                "title": ch["title"],
                "chapter_index": ch["chapter_index"],
                "audio_url": f"/api/books/{slug}/audio/{ch['id']}",
            }
            for ch in active_chapters
        ],
    }

    meta_path = target_book_dir / "metadata.json"
    meta_path.write_text(json.dumps(book_metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info(f"Audiobook generation completed for '{slug}' at {target_book_dir}")
    return {
        "slug": slug,
        "output_dir": str(target_book_dir),
        "chapters": processed_chapters,
        "total_chapters": len(active_chapters),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="VieNeu-TTS v3 RAM-Based Audiobook Generator")
    parser.add_argument("--input", "-i", type=str, default=None, help="Path to input .epub or .txt file")
    parser.add_argument("--epub", type=str, default=None, help="Path to input .epub file (legacy flag)")
    parser.add_argument("--txt", type=str, default=None, help="Path to input .txt file")
    parser.add_argument("--slug", type=str, default=None, help="Slug for book (defaults to filename or title)")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="/mnt/gdrive/audiobooks",
        help="Target output base directory (e.g. /mnt/gdrive/audiobooks)",
    )
    parser.add_argument("--voice", type=str, default="vie_neu_v3_female", help="Voice model ID")
    parser.add_argument("--voice-tag", type=str, default=None, help="Suffix tag for multi-voice chapters (e.g. ngochuyen, custom_voice)")
    parser.add_argument("--ram-dir", type=str, default=None, help="RAM disk directory (default: /dev/shm)")
    parser.add_argument("--bitrate", type=str, default="64k", help="Audio bitrate for FFmpeg (default: 64k)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate TTS without neural inference")
    parser.add_argument(
        "--no-skip-existing",
        action="store_true",
        help="Force re-generation of already existing chapters",
    )
    parser.add_argument("--max-chapters", type=int, default=None, help="Limit number of chapters to process")

    args = parser.parse_args()

    input_file_str = args.input or args.epub or args.txt
    if not input_file_str:
        logger.error("Please specify an input file via --input, --epub, or --txt.")
        sys.exit(1)

    input_path = Path(input_file_str)
    if not input_path.exists():
        if args.epub or input_path.suffix.lower() == ".epub":
            logger.error(f"Input EPUB file not found: {input_path}")
        else:
            logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    metadata_info, chapters = extract_book_chapters(input_path)
    book_slug = args.slug or slugify(metadata_info.get("title", input_path.stem))
    output_base_dir = Path(args.output_dir)
    ram_dir = Path(args.ram_dir) if args.ram_dir else None

    generate_audiobook(
        slug=book_slug,
        output_base_dir=output_base_dir,
        chapters=chapters,
        metadata_info=metadata_info,
        voice=args.voice,
        voice_tag=args.voice_tag,
        ram_dir=ram_dir,
        bitrate=args.bitrate,
        dry_run=args.dry_run,
        skip_existing=not args.no_skip_existing,
        max_chapters=args.max_chapters,
    )


if __name__ == "__main__":
    main()
