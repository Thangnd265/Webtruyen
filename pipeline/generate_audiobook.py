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
root_dir = pipeline_dir.parent
for p in [str(pipeline_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

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
    """TTS Synthesizer wrapper supporting VieNeu-TTS v3 and OmniVoice neural synthesis, with mock mode."""

    def __init__(
        self,
        voice: str = "Ngọc Huyền",
        dry_run: bool = False,
        model_path: Optional[str] = None,
    ) -> None:
        self.voice = voice
        self.dry_run = dry_run
        self.model_path = model_path
        self._model = None
        self.is_omnivoice = "omnivoice" in self.voice.lower()
        self._omni_model = None
        self._omni_prompt = None
        self._omni_config = None

        if not self.dry_run:
            self._init_real_model()

    def _init_real_model(self) -> None:
        if self.is_omnivoice:
            try:
                import torch
                from omnivoice import OmniVoice, VoiceClonePrompt
                from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

                device = "cuda:0" if torch.cuda.is_available() else "cpu"
                dtype = torch.float16 if torch.cuda.is_available() else torch.float32
                logger.info(f"OmniVoice engine loading on {device} ({dtype})...")
                self._omni_model = OmniVoice.from_pretrained(
                    "k2-fsa/OmniVoice",
                    device_map=device,
                    dtype=dtype,
                )

                prompt_file = Path(r"C:\Users\Thang.PC\Documents\Server\Webtruyenv2\voices\omnivoice_sample_clean_5s_prompt.pt")
                if not prompt_file.is_file():
                    prompt_file = Path(__file__).resolve().parent.parent / "voices" / "omnivoice_sample_clean_5s_prompt.pt"

                if prompt_file.is_file():
                    logger.info(f"Loading OmniVoice prompt from {prompt_file.name}...")
                    self._omni_prompt = VoiceClonePrompt.load(str(prompt_file))
                else:
                    ref_audio = prompt_file.parent / "sample_voice_clean_5s.wav"
                    ref_text = "Lời vừa dứt, Lữ Bình và Trương Hoài đột ngột ngẩng đầu, vẻ mặt đầy bất phục nhìn chằm chằm Cố Thương."
                    logger.info(f"Creating OmniVoice clone prompt from {ref_audio.name}...")
                    self._omni_prompt = self._omni_model.create_voice_clone_prompt(
                        ref_audio=str(ref_audio), ref_text=ref_text
                    )
                    self._omni_prompt.save(str(prompt_file))

                self._omni_config = OmniVoiceGenerationConfig(
                    postprocess_output=False,
                    preprocess_prompt=True,
                    guidance_scale=2.0,
                    denoise=True,
                )
                logger.info("OmniVoice engine initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to load OmniVoice engine: {e}")
                raise
        else:
            try:
                from vieneu import Vieneu

                logger.info("VieNeu-TTS v3 engine successfully loaded.")
                self._model = Vieneu()
                if self.model_path and Path(self.model_path).exists():
                    logger.info(f"Loading custom voice presets from {self.model_path}...")
                    self._model._load_voices_from_file(Path(self.model_path))
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
        """Synthesizes text using OmniVoice or VieNeu-TTS v3 model."""
        if self.is_omnivoice:
            if self._omni_model is None or self._omni_prompt is None:
                raise RuntimeError("OmniVoice engine is not available.")
            import soundfile as sf
            audios = self._omni_model.generate(
                text=[text],
                voice_clone_prompt=self._omni_prompt,
                language="vi",
                generation_config=self._omni_config,
            )
            audio = audios[0]
            sf.write(str(output_wav_path), audio, 24000)
            return get_wav_duration(output_wav_path)
        else:
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


def get_voice_tag(voice_name: str) -> str:
    """Computes a clean, standardized voice tag suffix for parallel voice storage."""
    if not voice_name:
        return "default"
    v = voice_name.lower().strip()
    if "omni" in v:
        return "omnivoice"
    if "huyền" in v or "ngochuyen" in v:
        return "ngochuyen"
    if "minh" in v or "thienminh" in v:
        return "thienminh"
    if "quỳnh" in v or "quynhanh" in v:
        return "quynhanh"
    if "đăng" in v or "haidang" in v:
        return "haidang"
    if "sơn" in v or "thaison" in v:
        return "thaison"
    if "duyên" in v or "myduyen" in v:
        return "myduyen"
    if "quang" in v or "quangson" in v:
        return "quangson"
    clean = re.sub(r"[^a-zA-Z0-9]+", "_", v).strip("_")
    return clean or "default"


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

    v_tag = voice_tag or get_voice_tag(tts.voice)
    tag_suffix = f"_{v_tag}" if v_tag else ""
    m4b_path = output_dir / f"{chapter_id}{tag_suffix}.m4b"
    cues_path = output_dir / f"{chapter_id}{tag_suffix}_cues.json"
    html_path = output_dir / f"{chapter_id}.html"

    # Chapter resume capability specifically for this voice tag:
    if skip_existing and m4b_path.exists() and m4b_path.stat().st_size > 0 and cues_path.exists():
        logger.info(f"Chapter {chapter_id} ({v_tag}) already exists in {output_dir}. Skipping (resume).")
        return {"status": "skipped", "chapter_id": chapter_id}

    if ram_base_dir is None:
        ram_base_dir = get_default_ram_dir()

    # Create temporary batch directory in RAM Disk (deterministic per book, chapter & voice)
    batch_ram_dir = ram_base_dir / f"tts_batch_{slug}_{chapter_id}_{v_tag}"
    batch_ram_dir.mkdir(parents=True, exist_ok=True)
    stitch_success = False

    try:
        raw_html = chapter.get("html", "")
        cues_raw = split_into_cues(raw_html)
        if not cues_raw:
            logger.warning(f"Chapter {chapter_id} has no text to synthesize.")
            return {"status": "empty", "chapter_id": chapter_id}

        wav_files: List[Path] = []
        final_cues: List[Dict[str, Any]] = []
        current_time: float = 0.0
        total_cues = len(cues_raw)

        for idx, cue in enumerate(cues_raw, 1):
            cue_id = cue["id"]
            sentence_text = cue["text"]
            wav_path = batch_ram_dir / f"{cue_id}.wav"

            # Checkpoint resume in RAM Disk: reuse already synthesized WAV if present
            if wav_path.is_file() and wav_path.stat().st_size > 44:
                duration = get_wav_duration(wav_path)
            else:
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

            # Emit real-time progress for scheduler and live console
            pct = round((idx / total_cues) * 100, 1)
            print(f"PROGRESS:{chapter_id}:{idx}:{total_cues}:{pct}", flush=True)
            if idx % 10 == 0 or idx == total_cues or idx == 1:
                logger.info(f"[{chapter_id}] Đang tổng hợp câu {idx}/{total_cues} ({pct}%)")

        # Stitch all individual sentence WAVs into chapter .m4b
        stitch_success = stitch_to_m4b(wav_files, m4b_path, ram_dir=batch_ram_dir, bitrate=bitrate)
        if not stitch_success:
            logger.error(f"Failed to stitch audio for chapter {chapter_id}.")
            return {
                "status": "failed",
                "chapter_id": chapter_id,
                "error": "Audio stitching failed",
            }

        # Write exact sentence timing cues for this specific voice
        cues_path.write_text(json.dumps(final_cues, ensure_ascii=False, indent=2), encoding="utf-8")

        # If default untagged audio doesn't exist yet, also create fallback copy
        default_m4b = output_dir / f"{chapter_id}.m4b"
        default_cues = output_dir / f"{chapter_id}_cues.json"
        if not default_m4b.exists():
            try:
                shutil.copy2(str(m4b_path), str(default_m4b))
                shutil.copy2(str(cues_path), str(default_cues))
            except Exception:
                pass

        # Write chapter HTML with cue IDs and timing metadata if not already present
        if not html_path.exists():
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
        # Guarantee 0 MB local SSD / RAM leak by purging temporary batch files once stitched
        if stitch_success and batch_ram_dir.exists():
            shutil.rmtree(batch_ram_dir, ignore_errors=True)


def extract_epub_chapters(epub_path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Extracts book metadata, cover, and document chapters from an EPUB file."""
    import ebooklib  # type: ignore
    from bs4 import BeautifulSoup
    from ebooklib import epub  # type: ignore

    # Tolerant zip reading: do not crash if manifest has typos or missing files
    try:
        orig_read_file = epub.EpubReader.read_file
        def safe_read_file(self, name):
            try:
                return orig_read_file(self, name)
            except (KeyError, FileNotFoundError):
                return b""
        epub.EpubReader.read_file = safe_read_file
    except Exception:
        pass

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

    chapters: List[Dict[str, Any]] = []
    chapter_index = 1
    has_intro = False

    for item in document_items:
        content = item.get_content().decode("utf-8", errors="ignore")
        soup = BeautifulSoup(content, "html.parser")
        text = soup.get_text(separator=" ", strip=True)

        # Ignore tiny non-content items (e.g. toc, nav, title page)
        if len(text) < 40 and not soup.find(["p", "article"]):
            continue

        chapter_title = ""

        # 1. Check title tag first (often cleanest and most reliable in EPUBs)
        title_tag = soup.find("title")
        if title_tag and title_tag.get_text(strip=True):
            t_raw = title_tag.get_text(strip=True)
            t_clean = t_raw.split(" - ")[0].split(" | ")[0].strip()
            if re.search(r"(?:chương|hồi|tiết|bài|chapter)\s*\d+", t_clean, re.IGNORECASE):
                chapter_title = t_clean

        # 2. Check headings h1-h6
        if not chapter_title:
            heading = soup.find(["h1", "h2", "h3", "h4", "h5", "h6"])
            if heading and heading.get_text(strip=True):
                h_text = heading.get_text(strip=True)
                if len(h_text) < 150:
                    chapter_title = h_text

        # 3. Check for specific chapter title pattern in text snippet
        if not chapter_title:
            m = re.search(r"((?:chương|hồi|tiết|bài|chapter)\s*\d+[^<\n\r]{0,60})", text, re.IGNORECASE)
            if m:
                chapter_title = m.group(1).strip()

        # 4. Determine if introduction or normal chapter
        is_intro = False
        if chapter_index == 1 and not has_intro:
            has_ch_kw = bool(re.search(r"(?:chương|hồi|tiết|bài|chapter)\s*\d+", chapter_title or text, re.IGNORECASE))
            if not has_ch_kw:
                is_intro = True

        if is_intro:
            chapter_title = chapter_title or "Giới Thiệu"
            ch_id = "chapter_000"
            curr_idx = 0
            has_intro = True
        else:
            if not chapter_title:
                chapter_title = f"Chương {chapter_index}"
            ch_id = f"chapter_{chapter_index:03d}"
            curr_idx = chapter_index
            chapter_index += 1

        chapters.append({
            "id": ch_id,
            "title": chapter_title,
            "chapter_index": curr_idx,
            "html": content,
        })

    return metadata_info, chapters


def generate_audiobook(
    slug: str,
    output_base_dir: Path,
    chapters: List[Dict[str, Any]],
    metadata_info: Dict[str, Any],
    voice: str = "Ngọc Huyền",
    ram_dir: Optional[Path] = None,
    bitrate: str = "64k",
    dry_run: bool = False,
    skip_existing: bool = True,
    max_chapters: Optional[int] = None,
    start_chapter: int = 1,
    model_path: Optional[str] = None,
    voice_tag: Optional[str] = None,
) -> Dict[str, Any]:
    """Generates complete audiobook directly to target output directory."""
    target_book_dir = output_base_dir / slug
    target_book_dir.mkdir(parents=True, exist_ok=True)

    if ram_dir is None:
        ram_dir = get_default_ram_dir()

    tts = TTSEngine(voice=voice, dry_run=dry_run, model_path=model_path)

    # Save cover if present
    if "cover_bytes" in metadata_info:
        cover_path = target_book_dir / "cover.jpg"
        cover_path.write_bytes(metadata_info["cover_bytes"])

    # Slice chapters by start_chapter and max_chapters
    has_ch0 = len(chapters) > 0 and (chapters[0].get("id") == "chapter_000" or chapters[0].get("chapter_index") == 0)
    if has_ch0:
        start_idx = max(0, start_chapter) if start_chapter is not None else 0
    else:
        start_idx = max(0, start_chapter - 1) if start_chapter else 0
    if max_chapters:
        active_chapters = chapters[start_idx : start_idx + max_chapters]
    else:
        active_chapters = chapters[start_idx:]

    def _sync_metadata():
        meta_path = target_book_dir / "metadata.json"
        existing_chapters_map = {}
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    old_meta = json.load(f)
                    for ch in old_meta.get("chapters", []):
                        existing_chapters_map[ch["id"]] = ch
            except Exception as e:
                logger.warning(f"Could not read existing metadata.json: {e}")

        # Ensure all book chapters are registered and have latest titles
        for ch in chapters:
            ch_id = ch["id"]
            if ch_id not in existing_chapters_map:
                existing_chapters_map[ch_id] = {
                    "id": ch_id,
                    "title": ch["title"],
                    "chapter_index": ch["chapter_index"],
                    "audio_url": f"/api/books/{slug}/audio/{ch_id}",
                }
            else:
                existing_chapters_map[ch_id]["title"] = ch["title"]

        combined_chapters = sorted(
            existing_chapters_map.values(),
            key=lambda c: c.get("chapter_index", 0)
        )

        book_metadata = {
            "title": metadata_info.get("title", slug),
            "author": metadata_info.get("author", "Unknown"),
            "description": metadata_info.get("description", ""),
            "slug": slug,
            "cover_url": f"/api/books/{slug}/cover" if (target_book_dir / "cover.jpg").exists() else None,
            "total_chapters": len(combined_chapters),
            "chapters": combined_chapters,
        }
        meta_path.write_text(json.dumps(book_metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        return combined_chapters

    # Write metadata upfront so chapters are immediately visible on web
    all_chapters = _sync_metadata()

    processed_chapters = []
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
        all_chapters = _sync_metadata()

    logger.info(f"Audiobook generation completed for '{slug}' at {target_book_dir} (Total chapters on web: {len(chapters)})")
    return {
        "slug": slug,
        "output_dir": str(target_book_dir),
        "chapters": processed_chapters,
        "total_chapters": len(all_chapters),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="VieNeu-TTS v3 RAM-Based Audiobook Generator")
    parser.add_argument("input_pos", nargs="?", default=None, help="Path to input file (positional)")
    parser.add_argument("--input", "-i", type=str, default=None, help="Path to input .epub or .txt file")
    parser.add_argument("--epub", type=str, default=None, help="Path to input .epub file (legacy flag)")
    parser.add_argument("--txt", type=str, default=None, help="Path to input .txt file")
    parser.add_argument("--slug", type=str, default=None, help="Slug for book (defaults to filename or title)")
    parser.add_argument("--title", type=str, default=None, help="Book title override")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="/mnt/gdrive/audiobooks",
        help="Target output base directory (e.g. /mnt/gdrive/audiobooks)",
    )
    parser.add_argument("--voice", type=str, default="Ngọc Huyền", help="Voice model ID")
    parser.add_argument("--voice-tag", type=str, default=None, help="Suffix tag for multi-voice chapters (e.g. ngochuyen, custom_voice)")
    parser.add_argument("--ram-dir", type=str, default=None, help="RAM disk directory (default: /dev/shm)")
    parser.add_argument("--bitrate", type=str, default="64k", help="Audio bitrate for FFmpeg (default: 64k)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate TTS without neural inference")
    parser.add_argument(
        "--no-skip-existing",
        action="store_true",
        help="Force re-generation of already existing chapters",
    )
    parser.add_argument("--start-chapter", type=int, default=1, help="Starting chapter index (1-based)")
    parser.add_argument("--max-chapters", type=int, default=None, help="Limit number of chapters to process")

    args = parser.parse_args()

    input_file_str = args.input_pos or args.input or args.epub or args.txt
    if not input_file_str:
        logger.error("Please specify an input file via positional argument, --input, --epub, or --txt.")
        sys.exit(1)

    input_path = Path(input_file_str)
    if not input_path.exists():
        if args.epub or input_path.suffix.lower() == ".epub":
            logger.error(f"Input EPUB file not found: {input_path}")
        else:
            logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    metadata_info, chapters = extract_book_chapters(input_path)
    if args.title:
        metadata_info["title"] = args.title
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
        start_chapter=args.start_chapter,
    )


if __name__ == "__main__":
    main()
