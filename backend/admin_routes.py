"""Admin API Routes for Webtruyenv2 Management Dashboard.

Endpoints:
- Auth: PIN verification.
- System Health: CPU, RAM, RAM Disk (/dev/shm), Storage.
- Books Management: List, Upload, Update settings, Delete.
- Chapter Manager: Detailed chapter inspection, single-chapter re-rendering.
- Live Queue: Real-time progress, run-now, cancel.
- Logs & History: Render history, live logs.
- Voices & Settings: 25 VieNeu presets with audio preview links.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger("admin_routes")

# Setup sys.path
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from config import settings
    from database import get_db
    from scheduler import queue_manager
except ImportError:
    from backend.config import settings
    from backend.database import get_db
    from backend.scheduler import queue_manager

try:
    from pipeline.universal_extractor import extract_book_chapters
    from pipeline.generate_audiobook import slugify
except ImportError:
    try:
        from universal_extractor import extract_book_chapters
        from generate_audiobook import slugify
    except ImportError:
        extract_book_chapters = None
        def slugify(text: str) -> str:
            return re.sub(r"[-\s]+", "-", re.sub(r"[^\w\s-]", "", text).strip().lower())

router = APIRouter(prefix="/api/admin", tags=["admin"])

PRESET_VOICES = [
    {"name": "Ngọc Huyền", "gender": "Nữ", "region": "Bắc", "desc": "Tự nhiên, truyền cảm (Mặc định)", "preview": "/api/admin/voices/preview/02_ngochuyen_nu_bac_tunhien.mp3"},
    {"name": "Thiện Minh", "gender": "Nam", "region": "Bắc", "desc": "Trầm ấm, kể chuyện kiếm hiệp", "preview": "/api/admin/voices/preview/01_thienminh_nam_bac_kechuyen.mp3"},
    {"name": "Quỳnh Anh", "gender": "Nữ", "region": "Bắc", "desc": "Trang trọng, đọc truyện lôi cuốn", "preview": "/api/admin/voices/preview/03_quynhanh_nu_bac_doctruyen.mp3"},
    {"name": "Hải Đăng", "gender": "Nam", "region": "Bắc", "desc": "Trầm ấm, MC tin tức", "preview": "/api/admin/voices/preview/04_haidang_nam_bac_tramam.mp3"},
    {"name": "Thái Sơn", "gender": "Nam", "region": "Nam", "desc": "Giọng Nam Bộ kể chuyện lôi cuốn", "preview": "/api/admin/voices/preview/05_thaison_nam_nam_kechuyen.mp3"},
    {"name": "Mỹ Duyên", "gender": "Nữ", "region": "Nam", "desc": "Nữ Nam Bộ nhẹ nhàng, tình cảm", "preview": "/api/admin/voices/preview/06_myduyen_nu_nam_doctruyen.mp3"},
    {"name": "Quang Sơn", "gender": "Nam", "region": "Trung", "desc": "Giọng Miền Trung mộc mạc, truyền cảm", "preview": "/api/admin/voices/preview/07_quangson_nam_trung_tunhien.mp3"},
    {"name": "Bảo Ngọc", "gender": "Nữ", "region": "Bắc", "desc": "Trong trẻo, tươi sáng", "preview": None},
    {"name": "Phương Trang", "gender": "Nữ", "region": "Nam", "desc": "Truyền cảm hứng, dịu dàng", "preview": None},
    {"name": "Minh Quân", "gender": "Nam", "region": "Bắc", "desc": "Hào sảng, dứt khoát", "preview": None},
    {"name": "Thảo Nhi", "gender": "Nữ", "region": "Nam", "desc": "Nhẹ nhàng, thanh thoát", "preview": None},
    {"name": "Đức Anh", "gender": "Nam", "region": "Bắc", "desc": "Thanh niên hiện đại", "preview": None},
    {"name": "Thanh Hương", "gender": "Nữ", "region": "Bắc", "desc": "Chững chạc, uyển chuyển", "preview": None},
    {"name": "Hoàng Long", "gender": "Nam", "region": "Bắc", "desc": "Vang, hào sảng kiếm hiệp", "preview": None},
    {"name": "Lan Chi", "gender": "Nữ", "region": "Bắc", "desc": "Ngọt ngào, dịu êm", "preview": None},
]


def get_current_pin() -> str:
    with get_db() as conn:
        row = conn.execute("SELECT value FROM admin_settings WHERE key = 'admin_pin'").fetchone()
        if row and row["value"]:
            return row["value"]
    return "123456"


def verify_admin_token(authorization: Optional[str] = Header(None)) -> bool:
    """Verifies simple admin token based on current pin hash."""
    if not authorization:
        # In internal dev environment allow read, but enforce for mutations if provided
        return True
    token = authorization.replace("Bearer ", "").strip()
    current_pin = get_current_pin()
    expected = hashlib.sha256(f"webtruyen_admin_{current_pin}".encode()).hexdigest()
    if token != expected:
        raise HTTPException(status_code=401, detail="Mã PIN không chính xác hoặc phiên đã hết hạn")
    return True


# -------------------------------------------------------------
# 1. AUTHENTICATION & SETTINGS
# -------------------------------------------------------------

class PinVerifyRequest(BaseModel):
    pin: str


class UpdateSettingsRequest(BaseModel):
    admin_pin: Optional[str] = None
    default_voice: Optional[str] = None


@router.post("/auth/verify")
def verify_pin(req: PinVerifyRequest):
    current_pin = get_current_pin()
    if req.pin == current_pin:
        token = hashlib.sha256(f"webtruyen_admin_{current_pin}".encode()).hexdigest()
        return {"authenticated": True, "token": token}
    raise HTTPException(status_code=401, detail="Mã PIN không chính xác")


@router.get("/settings")
def get_settings():
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM admin_settings").fetchall()
        settings_dict = {r["key"]: r["value"] for r in rows}
    # Mask pin
    pin_val = settings_dict.get("admin_pin", "123456")
    settings_dict["admin_pin_masked"] = "*" * len(pin_val)
    del settings_dict["admin_pin"]
    return settings_dict


@router.post("/settings")
def update_settings(req: UpdateSettingsRequest):
    with get_db() as conn:
        if req.admin_pin:
            if len(req.admin_pin) < 4:
                raise HTTPException(status_code=400, detail="Mã PIN phải từ 4 ký tự trở lên")
            conn.execute("UPDATE admin_settings SET value = ? WHERE key = 'admin_pin'", (req.admin_pin,))
        if req.default_voice:
            conn.execute("UPDATE admin_settings SET value = ? WHERE key = 'default_voice'", (req.default_voice,))
    return {"status": "ok", "message": "Đã lưu cài đặt quản trị thành công"}


@router.get("/voices")
def list_voices():
    return PRESET_VOICES


@router.get("/voices/preview/{filename}")
def get_voice_preview(filename: str):
    from fastapi.responses import FileResponse
    # Look for showcase audio in project or voices dir
    candidate_paths = [
        root_dir / "voices_chapter1_showcase" / filename,
        root_dir / "voices" / filename,
        Path(settings.AUDIOBOOKS_DIR) / "voices" / filename,
    ]
    for p in candidate_paths:
        if p.is_file():
            return FileResponse(str(p), media_type="audio/mpeg")
    raise HTTPException(status_code=404, detail="File audio mẫu không tồn tại")


# -------------------------------------------------------------
# 2. CHỨC NĂNG 5: GIÁM SÁT TÀI NGUYÊN SERVER (SYSTEM HEALTH)
# -------------------------------------------------------------

@router.get("/system/health")
def get_system_health():
    # 1. CPU
    cpu_count = os.cpu_count() or 1
    cpu_load_1m = 0.0
    if hasattr(os, "getloadavg"):
        try:
            load = os.getloadavg()
            cpu_load_1m = round(load[0], 2)
            cpu_percent = min(100, round((load[0] / cpu_count) * 100, 1))
        except Exception:
            cpu_percent = 0.0
    else:
        cpu_percent = 0.0

    # 2. Memory
    mem_total_gb = 16.0
    mem_used_gb = 2.0
    mem_percent = 12.5
    try:
        meminfo = Path("/proc/meminfo")
        if meminfo.is_file():
            lines = meminfo.read_text().splitlines()
            mem_dict = {}
            for line in lines:
                parts = line.split(":")
                if len(parts) == 2:
                    k = parts[0].strip()
                    v = parts[1].strip().split()[0]
                    if v.isdigit():
                        mem_dict[k] = int(v)
            if "MemTotal" in mem_dict and "MemAvailable" in mem_dict:
                tot = mem_dict["MemTotal"] / (1024 * 1024)
                avail = mem_dict["MemAvailable"] / (1024 * 1024)
                used = tot - avail
                mem_total_gb = round(tot, 1)
                mem_used_gb = round(used, 1)
                mem_percent = round((used / tot) * 100, 1)
    except Exception:
        pass

    # 3. RAM Disk (/dev/shm)
    shm_path = Path("/dev/shm")
    shm_info = {"exists": False, "total_gb": 0.0, "free_gb": 0.0, "used_gb": 0.0, "percent": 0.0}
    if shm_path.is_dir():
        try:
            usage = shutil.disk_usage(str(shm_path))
            tot = usage.total / (1024**3)
            free = usage.free / (1024**3)
            used = usage.used / (1024**3)
            pct = round((used / tot) * 100, 1) if tot > 0 else 0.0
            shm_info = {
                "exists": True,
                "total_gb": round(tot, 1),
                "free_gb": round(free, 1),
                "used_gb": round(used, 1),
                "percent": pct,
            }
        except Exception:
            pass

    # 4. Storage (Google Drive Audiobooks)
    storage_info = {"total_gb": 0.0, "free_gb": 0.0, "used_gb": 0.0, "percent": 0.0}
    try:
        books_dir = Path(settings.AUDIOBOOKS_DIR).resolve()
        if books_dir.is_dir():
            usage = shutil.disk_usage(str(books_dir))
            tot = usage.total / (1024**3)
            free = usage.free / (1024**3)
            used = usage.used / (1024**3)
            pct = round((used / tot) * 100, 1) if tot > 0 else 0.0
            storage_info = {
                "total_gb": round(tot, 1),
                "free_gb": round(free, 1),
                "used_gb": round(used, 1),
                "percent": pct,
                "path": str(books_dir),
            }
    except Exception:
        pass

    # 5. Service & Queue status
    q_stat = queue_manager.get_status()

    return {
        "status": "healthy",
        "cpu": {
            "cores": cpu_count,
            "load_1m": cpu_load_1m,
            "percent": cpu_percent,
        },
        "memory": {
            "total_gb": mem_total_gb,
            "used_gb": mem_used_gb,
            "percent": mem_percent,
        },
        "ram_disk": shm_info,
        "storage": storage_info,
        "queue": q_stat,
    }


# -------------------------------------------------------------
# 3. QUẢN LÝ DANH SÁCH TRUYỆN (BOOKS MANAGEMENT)
# -------------------------------------------------------------

class UpdateBookRequest(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    genres: Optional[str] = None
    cover_url: Optional[str] = None
    voice: Optional[str] = None
    daily_quota: Optional[int] = None
    schedule_time: Optional[str] = None
    auto_render: Optional[bool] = None


@router.get("/books")
def list_admin_books():
    books_dir = Path(settings.AUDIOBOOKS_DIR).resolve()

    # 1. Fetch all books registered in DB
    with get_db() as conn:
        db_rows = conn.execute("SELECT * FROM admin_books ORDER BY created_at DESC").fetchall()
        books_by_slug = {r["slug"]: dict(r) for r in db_rows}

    # 2. Sync folders on disk with database
    if books_dir.is_dir():
        for d in books_dir.iterdir():
            if not d.is_dir() or d.name.startswith(".") or d.name in {"incoming_books", "voices", "lost+found"}:
                continue
            slug = d.name
            meta_file = d / "metadata.json"
            title = slug.replace("-", " ").title()
            author = "Chưa rõ"
            cover_url = f"/api/books/{slug}/cover" if (d / "cover.jpg").is_file() else None
            total_chapters = 0
            genres = "Huyền Huyễn, Đô Thị"

            if meta_file.is_file():
                try:
                    data = json.loads(meta_file.read_text(encoding="utf-8"))
                    title = data.get("title", title)
                    author = data.get("author", author)
                    cover_url = data.get("cover_url", cover_url)
                    chapters = data.get("chapters", [])
                    total_chapters = len(chapters)
                    genres = data.get("genres", genres)
                except Exception:
                    pass

            # Count chapters with audio files on disk
            rendered_chapters = 0
            for item in d.glob("chapter_*"):
                if item.suffix in [".mp3", ".m4b", ".aac", ".wav"]:
                    rendered_chapters += 1

            if slug in books_by_slug:
                b = books_by_slug[slug]
                b["rendered_chapters"] = rendered_chapters
                if total_chapters > 0:
                    b["total_chapters"] = max(b.get("total_chapters", 0), total_chapters)
                if cover_url and not b.get("cover_url"):
                    b["cover_url"] = cover_url
                if author != "Chưa rõ" and b.get("author") in {"", "Chưa rõ"}:
                    b["author"] = author
                if title != slug.replace("-", " ").title() and b.get("title") == slug:
                    b["title"] = title
            else:
                # Discovered a novel directory on disk not yet tracked in DB
                with get_db() as conn:
                    conn.execute(
                        """
                        INSERT INTO admin_books (
                            slug, title, author, genres, cover_url, voice,
                            daily_quota, schedule_time, auto_render,
                            current_rendered_chapter, total_chapters, status
                        ) VALUES (?, ?, ?, ?, ?, 'Ngọc Huyền', 50, '02:00', 1, ?, ?, 'idle')
                        ON CONFLICT(slug) DO NOTHING
                        """,
                        (slug, title, author, genres, cover_url, rendered_chapters, max(total_chapters, rendered_chapters)),
                    )
                books_by_slug[slug] = {
                    "slug": slug,
                    "title": title,
                    "author": author,
                    "genres": genres,
                    "cover_url": cover_url,
                    "voice": "Ngọc Huyền",
                    "daily_quota": 50,
                    "schedule_time": "02:00",
                    "auto_render": 1,
                    "current_rendered_chapter": rendered_chapters,
                    "total_chapters": max(total_chapters, rendered_chapters),
                    "rendered_chapters": rendered_chapters,
                    "status": "idle",
                    "source_filename": "",
                }

    # 3. For any DB book that has no folder or wasn't iterated, calculate rendered count
    for slug, b in books_by_slug.items():
        if "rendered_chapters" not in b:
            d = books_dir / slug
            rendered_chapters = 0
            if d.is_dir():
                for item in d.glob("chapter_*"):
                    if item.suffix in [".mp3", ".m4b", ".aac", ".wav"]:
                        rendered_chapters += 1
            b["rendered_chapters"] = rendered_chapters

        if not b.get("cover_url") and (books_dir / slug / "cover.jpg").is_file():
            b["cover_url"] = f"/api/books/{slug}/cover"

    return list(books_by_slug.values())


@router.post("/books/upload")
async def upload_book(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    genres: Optional[str] = Form("Huyền Huyễn, Tiên Hiệp"),
    voice: str = Form("Ngọc Huyền"),
    daily_quota: int = Form(50),
    schedule_time: str = Form("02:00"),
    auto_render: bool = Form(True),
    run_now: bool = Form(False),
):
    """Uploads a novel file directly via web, extracts chapters, and registers settings."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Vui lòng chọn file truyện hợp lệ")

    ext = Path(file.filename).suffix.lower()
    allowed = {".epub", ".txt", ".mobi", ".pdf", ".docx", ".fb2", ".prc", ".azw", ".azw3"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Định dạng file {ext} không được hỗ trợ")

    book_title = (title or Path(file.filename).stem).strip()
    book_slug = slugify(book_title)
    if not book_slug:
        book_slug = f"book-{int(datetime.datetime.now().timestamp())}"

    # Target folder: incoming_books on audiobooks dir or local
    books_dir = Path(settings.AUDIOBOOKS_DIR).resolve()
    incoming_dir = books_dir / "incoming_books"
    incoming_dir.mkdir(parents=True, exist_ok=True)

    dest_file = incoming_dir / f"{book_slug}{ext}"
    content = await file.read()
    dest_file.write_bytes(content)

    total_chapters = 0
    extracted_title = book_title
    extracted_author = author or "Chưa rõ"
    meta_info: Dict[str, Any] = {}
    ch_list: List[Dict[str, Any]] = []

    if extract_book_chapters:
        try:
            meta_info, ch_list = extract_book_chapters(dest_file)
            total_chapters = len(ch_list)
            if not title and meta_info.get("title"):
                extracted_title = meta_info["title"]
            if not author and meta_info.get("author"):
                extracted_author = meta_info["author"]
        except Exception as e:
            logger.warning(f"Could not extract chapters directly during upload: {e}")

    canonical_slug = slugify(extracted_title) or book_slug

    # Initialize book directory & cover
    book_dir = books_dir / canonical_slug
    book_dir.mkdir(parents=True, exist_ok=True)

    cover_url = None
    if meta_info.get("cover_bytes"):
        try:
            (book_dir / "cover.jpg").write_bytes(meta_info["cover_bytes"])
            cover_url = f"/api/books/{canonical_slug}/cover"
        except Exception as e:
            logger.warning(f"Could not save cover image: {e}")
    elif (book_dir / "cover.jpg").is_file():
        cover_url = f"/api/books/{canonical_slug}/cover"

    # Save initial metadata.json if not present
    meta_path = book_dir / "metadata.json"
    if not meta_path.is_file() and ch_list:
        try:
            initial_meta = {
                "title": extracted_title,
                "author": extracted_author,
                "genres": genres,
                "cover_url": cover_url,
                "chapters": [
                    {"id": ch["id"], "title": ch["title"], "chapter_index": ch.get("chapter_index", i + 1)}
                    for i, ch in enumerate(ch_list)
                ],
            }
            meta_path.write_text(json.dumps(initial_meta, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Could not write initial metadata.json: {e}")

    # Register in DB
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO admin_books (
                slug, title, author, genres, cover_url, voice,
                daily_quota, schedule_time, auto_render,
                current_rendered_chapter, total_chapters,
                source_filename, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'idle')
            ON CONFLICT(slug) DO UPDATE SET
                title = excluded.title,
                author = excluded.author,
                cover_url = CASE WHEN excluded.cover_url IS NOT NULL AND excluded.cover_url != '' THEN excluded.cover_url ELSE admin_books.cover_url END,
                voice = excluded.voice,
                daily_quota = excluded.daily_quota,
                schedule_time = excluded.schedule_time,
                auto_render = excluded.auto_render,
                total_chapters = excluded.total_chapters,
                source_filename = excluded.source_filename,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                canonical_slug,
                extracted_title,
                extracted_author,
                genres,
                cover_url,
                voice,
                daily_quota,
                schedule_time,
                1 if auto_render else 0,
                total_chapters,
                dest_file.name,
            ),
        )

    queue_manager.add_log(f"📥 Đã tải lên truyện mới: '{extracted_title}' ({total_chapters} chương).")

    if run_now:
        queue_manager.enqueue(
            book_slug=canonical_slug,
            book_title=extracted_title,
            start_ch=1,
            max_ch=daily_quota,
            voice=voice,
            priority=True,
        )

    return {
        "status": "ok",
        "slug": canonical_slug,
        "title": extracted_title,
        "author": extracted_author,
        "total_chapters": total_chapters,
        "message": f"Tải lên '{extracted_title}' thành công! Đã thiết lập {daily_quota} chương/ngày.",
    }


@router.put("/books/{slug}")
def update_book_settings(slug: str, req: UpdateBookRequest):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM admin_books WHERE slug = ?", (slug,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy truyện")

        updates = []
        params = []
        if req.title is not None:
            updates.append("title = ?")
            params.append(req.title)
        if req.author is not None:
            updates.append("author = ?")
            params.append(req.author)
        if req.genres is not None:
            updates.append("genres = ?")
            params.append(req.genres)
        if req.cover_url is not None:
            updates.append("cover_url = ?")
            params.append(req.cover_url)
        if req.voice is not None:
            updates.append("voice = ?")
            params.append(req.voice)
        if req.daily_quota is not None:
            updates.append("daily_quota = ?")
            params.append(req.daily_quota)
        if req.schedule_time is not None:
            updates.append("schedule_time = ?")
            params.append(req.schedule_time)
        if req.auto_render is not None:
            updates.append("auto_render = ?")
            params.append(1 if req.auto_render else 0)

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(slug)
            conn.execute(f"UPDATE admin_books SET {', '.join(updates)} WHERE slug = ?", params)

    # Sync metadata.json if title, author, or cover changed
    book_dir = Path(settings.AUDIOBOOKS_DIR).resolve() / slug
    meta_path = book_dir / "metadata.json"
    if meta_path.is_file() and (req.title or req.author or req.cover_url):
        try:
            m_data = json.loads(meta_path.read_text(encoding="utf-8"))
            if req.title:
                m_data["title"] = req.title
            if req.author:
                m_data["author"] = req.author
            if req.cover_url:
                m_data["cover_url"] = req.cover_url
            meta_path.write_text(json.dumps(m_data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    return {"status": "ok", "message": f"Đã cập nhật cấu hình cho truyện '{slug}'"}


@router.delete("/books/{slug}")
def delete_book(slug: str, delete_files: bool = Query(False)):
    with get_db() as conn:
        conn.execute("DELETE FROM admin_books WHERE slug = ?", (slug,))
    if delete_files:
        book_dir = Path(settings.AUDIOBOOKS_DIR).resolve() / slug
        if book_dir.is_dir():
            shutil.rmtree(str(book_dir), ignore_errors=True)
    return {"status": "ok", "message": f"Đã xoá truyện '{slug}'"}


# -------------------------------------------------------------
# 4. CHỨC NĂNG 3: QUẢN LÝ CHI TIẾT TỪNG CHƯƠNG (CHAPTER MANAGER)
# -------------------------------------------------------------

@router.get("/books/{slug}/chapters")
def list_book_chapters(slug: str):
    books_dir = Path(settings.AUDIOBOOKS_DIR).resolve()
    book_dir = books_dir / slug

    meta_file = book_dir / "metadata.json"
    chapters = []
    if meta_file.is_file():
        try:
            m_data = json.loads(meta_file.read_text(encoding="utf-8"))
            chapters = m_data.get("chapters", [])
        except Exception:
            pass

    # If chapters not in metadata.json, try reading from source file in incoming_books
    if not chapters:
        incoming_dir = books_dir / "incoming_books"
        candidates = list(incoming_dir.glob(f"{slug}.*")) + list(incoming_dir.glob(f"*{slug}*"))
        with get_db() as conn:
            row = conn.execute("SELECT source_filename FROM admin_books WHERE slug = ?", (slug,)).fetchone()
            if row and row["source_filename"]:
                db_source = incoming_dir / row["source_filename"]
                if db_source.is_file() and db_source not in candidates:
                    candidates.insert(0, db_source)

        for cand in candidates:
            if cand.is_file() and extract_book_chapters:
                try:
                    meta_info, ch_list = extract_book_chapters(cand)
                    chapters = [
                        {
                            "id": ch.get("id", f"chapter_{i+1:03d}"),
                            "title": ch.get("title", f"Chương {i+1}"),
                            "chapter_index": ch.get("chapter_index", i + 1),
                        }
                        for i, ch in enumerate(ch_list)
                    ]
                    break
                except Exception:
                    pass

    if not chapters and not book_dir.is_dir():
        raise HTTPException(status_code=404, detail="Thư mục truyện không tồn tại")

    chapter_details = []
    for ch in chapters:
        ch_id = ch.get("id", "")
        ch_title = ch.get("title", "")
        ch_idx = ch.get("chapter_index", 0)

        # Check audio existence (.m4b, .mp3, .wav, .aac)
        has_audio = False
        audio_file_size = 0
        if book_dir.is_dir():
            for ext in [".mp3", ".m4b", ".aac", ".wav"]:
                audio_p = book_dir / f"{ch_id}{ext}"
                if audio_p.is_file():
                    has_audio = True
                    audio_file_size = audio_p.stat().st_size
                    break

        # Check VTT subtitle existence
        has_vtt = (book_dir / f"{ch_id}.vtt").is_file() if book_dir.is_dir() else False

        chapter_details.append({
            "id": ch_id,
            "title": ch_title,
            "index": ch_idx,
            "has_audio": has_audio,
            "audio_url": f"/api/books/{slug}/audio/{ch_id}" if has_audio else None,
            "has_vtt": has_vtt,
            "vtt_url": f"/api/books/{slug}/vtt/{ch_id}" if has_vtt else None,
            "file_size": audio_file_size,
        })

    return chapter_details


class ReRenderChapterRequest(BaseModel):
    voice: Optional[str] = None


@router.post("/books/{slug}/chapters/{chapter_id}/re-render")
def re_render_single_chapter(slug: str, chapter_id: str, req: Optional[ReRenderChapterRequest] = None):
    """Enqueues re-rendering of a single chapter."""
    match = re.search(r"chapter_(\d+)", chapter_id)
    if not match:
        raise HTTPException(status_code=400, detail="Mã chương không hợp lệ (cần định dạng chapter_XXX)")
    ch_idx = int(match.group(1))

    with get_db() as conn:
        row = conn.execute("SELECT title, voice FROM admin_books WHERE slug = ?", (slug,)).fetchone()
        book_title = row["title"] if row else slug
        voice_to_use = (req.voice if req and req.voice else None) or (row["voice"] if row else "Ngọc Huyền")

    # Kiểm tra file truyện gốc, nếu thiếu phải báo lỗi và yêu cầu tải file
    source_file = queue_manager._find_source_file(slug)
    if not source_file:
        raise HTTPException(
            status_code=400,
            detail=f"Thiếu file truyện gốc! Không tìm thấy file (.epub / .txt) của '{book_title}'. Vui lòng tải file truyện lên qua nút 'Tải Truyện Mới' trước khi render lại.",
        )

    success = queue_manager.enqueue(
        book_slug=slug,
        book_title=f"{book_title} (Chương {ch_idx})",
        start_ch=ch_idx,
        max_ch=1,
        voice=voice_to_use,
        priority=True,
    )

    if not success:
        raise HTTPException(status_code=409, detail="Truyện này đã có trong hàng đợi hoặc đang chạy")

    return {
        "status": "ok",
        "message": f"Đã đưa Chương {ch_idx} của '{book_title}' vào hàng đợi ưu tiên render lại.",
    }


# -------------------------------------------------------------
# 5. CHỨC NĂNG 2: LIVE QUEUE & PROGRESS MONITOR
# -------------------------------------------------------------

class RunNowRequest(BaseModel):
    start_chapter: Optional[int] = None
    max_chapters: Optional[int] = None
    voice: Optional[str] = None


@router.post("/books/{slug}/run-now")
def run_book_now(slug: str, req: Optional[RunNowRequest] = None):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM admin_books WHERE slug = ?", (slug,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy truyện trong CSDL")

        b = dict(row)

    start_ch = (req.start_chapter if req and req.start_chapter is not None else None)
    if start_ch is None:
        start_ch = b["current_rendered_chapter"] + 1

    max_ch = (req.max_chapters if req and req.max_chapters is not None else None)
    if max_ch is None:
        max_ch = b["daily_quota"] or 50

    voice = (req.voice if req and req.voice else None) or b["voice"] or "Ngọc Huyền"

    # Kiểm tra file truyện gốc, nếu thiếu phải báo lỗi và yêu cầu tải file
    source_file = queue_manager._find_source_file(slug)
    if not source_file:
        raise HTTPException(
            status_code=400,
            detail=f"Thiếu file truyện gốc! Không tìm thấy file (.epub / .txt) của '{b['title']}'. Vui lòng tải file truyện lên qua nút 'Tải Truyện Mới' trước khi render.",
        )

    success = queue_manager.enqueue(
        book_slug=slug,
        book_title=b["title"],
        start_ch=start_ch,
        max_ch=max_ch,
        voice=voice,
        priority=True,
    )

    if not success:
        raise HTTPException(status_code=409, detail="Truyện này đang chạy hoặc đã nằm trong hàng đợi")

    return {
        "status": "ok",
        "message": f"Đã bắt đầu render '{b['title']}': Chương {start_ch} -> {start_ch + max_ch - 1}",
    }


@router.get("/queue/status")
def get_queue_status():
    return queue_manager.get_status()


@router.post("/queue/cancel")
def cancel_queue_item(slug: Optional[str] = Query(None)):
    if slug:
        removed = queue_manager.remove_from_queue(slug)
        if removed:
            return {"status": "ok", "message": f"Đã huỷ '{slug}' khỏi hàng đợi"}

    cancelled = queue_manager.cancel_current()
    if cancelled:
        return {"status": "ok", "message": "Đã gửi lệnh huỷ tác vụ đang chạy"}

    return {"status": "ok", "message": "Không có tác vụ nào đang chạy"}


# -------------------------------------------------------------
# 6. NHẬT KÝ & LOGS (HISTORY & LIVE LOGS)
# -------------------------------------------------------------

@router.get("/logs")
def get_render_logs(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM render_logs 
            ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/logs/live")
def get_live_logs():
    return {"logs": queue_manager.get_recent_logs()}
