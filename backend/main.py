import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure local backend dir is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from apps.web_reader.backend.config import settings
    from apps.web_reader.backend.kosync import (
        KosyncClient,
        get_book_chapters,
        get_document_hash,
        location_to_progress,
        progress_to_location,
    )
    from apps.web_reader.backend.stream import range_streamer
except ImportError:
    from config import settings
    from kosync import (
        KosyncClient,
        get_book_chapters,
        get_document_hash,
        location_to_progress,
        progress_to_location,
    )
    from stream import range_streamer

kosync_client = KosyncClient()

try:
    from database import init_db
except ImportError:
    from backend.database import init_db

app = FastAPI(title="Synced Web Reader API", version="1.0.0")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


def validate_identifier(val: str, name: str = "identifier") -> str:
    if not val or not re.match(r"^[a-zA-Z0-9_\-]+$", val):
        raise HTTPException(status_code=400, detail=f"Invalid {name}")
    return val


def get_safe_book_dir(slug: str) -> Path:
    validate_identifier(slug, "slug")
    books_dir = Path(settings.AUDIOBOOKS_DIR).resolve()
    book_dir = (books_dir / slug).resolve()
    if not book_dir.is_relative_to(books_dir) or not book_dir.is_dir():
        raise HTTPException(status_code=404, detail="Book not found")
    return book_dir


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/dev/git-sync")
def dev_git_sync():
    import subprocess
    repo_root = str(Path(__file__).resolve().parent.parent)
    try:
        r1 = subprocess.run(["git", "status"], capture_output=True, text=True, cwd=repo_root)
        r2 = subprocess.run(["git", "add", "-A"], capture_output=True, text=True, cwd=repo_root)
        r3 = subprocess.run(["git", "commit", "-m", "feat: dong bo du lieu truyen tu google drive, chi giu lai 3 bo truyen goc"], capture_output=True, text=True, cwd=repo_root)
        r4 = subprocess.run(["git", "push", "origin", "Giao-dien"], capture_output=True, text=True, cwd=repo_root)
        return {
            "status": "ok",
            "git_status": r1.stdout + r1.stderr,
            "git_commit": r3.stdout + r3.stderr,
            "git_push": r4.stdout + r4.stderr,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}



@app.get("/api/books")
def list_books():
    books_dir = Path(settings.AUDIOBOOKS_DIR)
    if not books_dir.exists():
        return []

    books = []
    for item in sorted(books_dir.iterdir(), key=lambda p: p.name):
        if item.is_dir():
            slug = item.name
            meta_file = item / "metadata.json"
            meta: Dict[str, Any] = {}
            if meta_file.exists():
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    pass

            chapters = get_book_chapters(item, meta.get("chapters"))
            total_chapters = meta.get("total_chapters", len(chapters))

            books.append({
                "slug": slug,
                "title": meta.get("title", slug.replace("-", " ").title()),
                "author": meta.get("author", "Unknown"),
                "description": meta.get("description", ""),
                "cover_url": meta.get("cover_url", f"/api/books/{slug}/cover"),
                "total_chapters": total_chapters,
                "genres": meta.get("genres", meta.get("genre", "Huyền Huyễn, Đô Thị")),
                "status": meta.get("status", "Đang ra"),
                "views": meta.get("views", "18.5k"),
                "rating": meta.get("rating", 4.8),
                "updated_at": meta.get("updated_at", "28/09/2026"),
            })
    return books


@app.get("/api/books/{slug}")
def get_book(slug: str):
    book_dir = get_safe_book_dir(slug)

    meta_file = book_dir / "metadata.json"
    meta: Dict[str, Any] = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    chapters = get_book_chapters(book_dir, meta.get("chapters"))
    total_chapters = meta.get("total_chapters", len(chapters))

    return {
        "slug": slug,
        "title": meta.get("title", slug.replace("-", " ").title()),
        "author": meta.get("author", "Unknown"),
        "description": meta.get("description", ""),
        "cover_url": meta.get("cover_url", f"/api/books/{slug}/cover"),
        "total_chapters": total_chapters,
        "genres": meta.get("genres", meta.get("genre", "Huyền Huyễn, Đô Thị")),
        "status": meta.get("status", "Đang ra"),
        "views": meta.get("views", "18.5k"),
        "rating": meta.get("rating", 4.8),
        "updated_at": meta.get("updated_at", "28/09/2026"),
        "chapters": chapters,
    }


@app.get("/api/books/{slug}/cover")
def get_book_cover(slug: str):
    book_dir = get_safe_book_dir(slug)
    for ext in [".jpg", ".jpeg", ".png", ".webp", ".svg"]:
        candidate = book_dir / f"cover{ext}"
        if candidate.is_file():
            media_type = "image/svg+xml" if ext == ".svg" else None
            return FileResponse(candidate, media_type=media_type)
    svg_placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="200" height="300" fill="#27272a"/><text x="100" y="150" fill="#a1a1aa" font-family="sans-serif" font-size="14" text-anchor="middle">No Cover</text></svg>'
    return Response(content=svg_placeholder, media_type="image/svg+xml")


@app.get("/api/books/{slug}/chapters/{chapter_id}")
def get_chapter(slug: str, chapter_id: str):
    validate_identifier(chapter_id, "chapter_id")
    book_dir = get_safe_book_dir(slug)

    # Locate cues file
    cues = []
    cues_file = None
    for name in [f"{chapter_id}_cues.json", f"{chapter_id}.cues.json", f"{chapter_id}.json"]:
        candidate = book_dir / name
        if candidate.exists() and candidate.is_file():
            cues_file = candidate
            break

    if cues_file:
        try:
            with open(cues_file, "r", encoding="utf-8") as f:
                cues = json.load(f)
        except Exception:
            cues = []

    # Locate HTML file
    html_file = None
    for name in [f"{chapter_id}.html", f"{chapter_id}.htm"]:
        candidate = book_dir / name
        if candidate.exists() and candidate.is_file():
            html_file = candidate
            break

    html_content = ""
    if html_file:
        try:
            with open(html_file, "r", encoding="utf-8") as f:
                html_content = f.read()
        except Exception:
            html_content = ""
    elif cues:
        html_paragraphs = [
            f'<p id="{c.get("id")}" data-start="{c.get("start")}" data-end="{c.get("end")}" class="reader-paragraph">{c.get("text", "")}</p>'
            for c in cues
        ]
        html_content = "\n".join(html_paragraphs)
    else:
        raise HTTPException(status_code=404, detail="Chapter not found")

    num_match = re.search(r"\d+", chapter_id)
    num = int(num_match.group(0)) if num_match else 1
    chapter_title = f"Chương {num}"

    meta_file = book_dir / "metadata.json"
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
                for ch in meta.get("chapters", []):
                    if ch.get("id") == chapter_id and "title" in ch:
                        chapter_title = ch["title"]
                        break
        except Exception:
            pass

    return {
        "chapter_id": chapter_id,
        "title": chapter_title,
        "html": html_content,
        "cues": cues,
        "audio_url": f"/api/books/{slug}/audio/{chapter_id}",
    }


@app.api_route("/api/books/{slug}/audio/{chapter_id}", methods=["GET", "HEAD"])
def stream_audio(
    slug: str,
    chapter_id: str,
    request: Request,
    voice: Optional[str] = None,
    pitch: Optional[str] = None
):
    validate_identifier(chapter_id, "chapter_id")
    book_dir = get_safe_book_dir(slug)

    audio_file = None
    direct = (book_dir / chapter_id).resolve()
    if direct.is_file() and direct.is_relative_to(book_dir):
        audio_file = direct
    else:
        candidates_to_try = []
        if voice:
            v_clean = re.sub(r"[^a-zA-Z0-9_\-]", "", voice.lower())
            p_clean = re.sub(r"[^a-zA-Z0-9_\-+]", "", pitch) if pitch else ""
            aliases = [v_clean]
            if v_clean in ["thienminh", "default"]:
                aliases.extend(["thienminh", "chapter_001", "male"])
            elif v_clean in ["trucly", "female", "nu"]:
                aliases.extend(["trucly", "female", "nu"])
            elif v_clean in ["haidang", "male", "nam"]:
                aliases.extend(["haidang", "male", "nam"])
            elif v_clean in ["quynhanh"]:
                aliases.extend(["quynhanh", "trucly", "female"])
            elif v_clean in ["thaison"]:
                aliases.extend(["thaison", "haidang", "male"])
            elif v_clean in ["myduyen"]:
                aliases.extend(["myduyen", "trucly", "female"])
            elif "female" in v_clean or "nu" in v_clean or "hoaimy" in v_clean:
                aliases.extend(["trucly", "female", "nu"])
            elif "male" in v_clean or "nam" in v_clean:
                aliases.extend(["thienminh", "haidang", "male", "nam"])

            pitch_variants = [p_clean, p_clean.lower(), p_clean.upper(), p_clean.replace("hz", "Hz")] if p_clean else []
            for a in dict.fromkeys(aliases):
                for p_var in dict.fromkeys(pitch_variants):
                    candidates_to_try.append(f"{chapter_id}_{a}_{p_var}")
                candidates_to_try.append(f"{chapter_id}_{a}")

        candidates_to_try.append(chapter_id)

        for name in candidates_to_try:
            for ext in [".mp3", ".m4b", ".aac", ".ogg", ".wav", ".mp4", ".m4a"]:
                candidate = (book_dir / f"{name}{ext}").resolve()
                if candidate.is_file() and candidate.is_relative_to(book_dir):
                    audio_file = candidate
                    break
            if audio_file:
                break

        # Fallback to default chapter audio
        if not audio_file:
            for ext in [".mp3", ".m4b", ".aac", ".ogg", ".wav", ".mp4", ".m4a"]:
                candidate = (book_dir / f"{chapter_id}{ext}").resolve()
                if candidate.is_file() and candidate.is_relative_to(book_dir):
                    audio_file = candidate
                    break

    if not audio_file or not audio_file.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")

    content_type = "audio/mp4" if str(audio_file).endswith((".m4b", ".mp4", ".m4a")) else "audio/mpeg"
    file_size = os.path.getsize(str(audio_file))

    if request.method == "HEAD":
        return Response(
            status_code=200,
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Content-Type": content_type
            }
        )

    range_header = request.headers.get("range") or request.headers.get("Range")
    return range_streamer(str(audio_file), range_header)


class SyncProgressRequest(BaseModel):
    chapter_id: Optional[str] = None
    cue_id: Optional[str] = None
    percentage: Optional[float] = None
    progress: Optional[str] = None
    device: Optional[str] = "WebReader"
    device_id: Optional[str] = None


@app.get("/api/books/{slug}/sync")
async def get_book_sync(slug: str):
    book_dir = get_safe_book_dir(slug)

    meta_file = book_dir / "metadata.json"
    meta: Dict[str, Any] = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    document_hash = get_document_hash(book_dir, slug, meta)
    sync_data = await kosync_client.get_progress(document_hash)

    if not sync_data:
        return {
            "document": document_hash,
            "percentage": 0.0,
            "chapter_id": None,
            "cue_id": None,
            "timestamp": None,
            "device": None,
            "progress": None,
        }

    percentage = float(sync_data.get("percentage", 0.0))
    if percentage > 1.0:
        percentage = percentage / 100.0
    percentage = max(0.0, min(1.0, percentage))

    progress_str = sync_data.get("progress")
    timestamp = sync_data.get("timestamp")
    device = sync_data.get("device")

    chapter_id = None
    cue_id = None
    if progress_str and "#" in str(progress_str):
        parts = str(progress_str).split("#", 1)
        chapter_id, cue_id = parts[0], parts[1]
    elif progress_str and str(progress_str).startswith("chapter_"):
        chapter_id = str(progress_str)

    if not chapter_id:
        chapter_id, cue_id = progress_to_location(book_dir, percentage)

    return {
        "document": document_hash,
        "percentage": percentage,
        "chapter_id": chapter_id,
        "cue_id": cue_id,
        "timestamp": timestamp,
        "device": device,
        "progress": progress_str,
    }


@app.post("/api/books/{slug}/sync")
async def post_book_sync(slug: str, req: SyncProgressRequest):
    book_dir = get_safe_book_dir(slug)
    if req.chapter_id:
        validate_identifier(req.chapter_id, "chapter_id")
    if req.cue_id:
        validate_identifier(req.cue_id, "cue_id")

    meta_file = book_dir / "metadata.json"
    meta: Dict[str, Any] = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    document_hash = get_document_hash(book_dir, slug, meta)

    percentage = req.percentage
    if percentage is not None and percentage > 1.0:
        percentage = percentage / 100.0
    if percentage is not None:
        percentage = max(0.0, min(1.0, float(percentage)))

    chapter_id = req.chapter_id
    cue_id = req.cue_id

    if percentage is None and chapter_id:
        percentage = location_to_progress(book_dir, chapter_id, cue_id)
    elif percentage is None:
        percentage = 0.0

    progress_str = req.progress
    if not progress_str:
        if chapter_id and cue_id:
            progress_str = f"{chapter_id}#{cue_id}"
        elif chapter_id:
            progress_str = chapter_id
        else:
            progress_str = str(percentage)

    metadata = None
    if meta.get("title") or meta.get("author"):
        metadata = {
            "title": meta.get("title", slug),
            "authors": meta.get("author", "Unknown"),
        }

    success = await kosync_client.push_progress(
        document_hash=document_hash,
        progress=progress_str,
        percentage=float(percentage),
        device=req.device or "WebReader",
        device_id=req.device_id,
        metadata=metadata,
    )

    if not success:
        raise HTTPException(status_code=502, detail="Failed to sync progress with Kosync server")

    return {
        "status": "ok",
        "document": document_hash,
        "percentage": percentage,
        "chapter_id": chapter_id,
        "cue_id": cue_id,
        "progress": progress_str,
    }


try:
    from auth_routes import router as auth_router
    from history_routes import router as history_router
except ImportError:
    from backend.auth_routes import router as auth_router
    from backend.history_routes import router as history_router

app.include_router(auth_router)
app.include_router(history_router)

# Mount frontend static files at root
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
frontend_dir.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


