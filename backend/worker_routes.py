"""Distributed GPU Worker Coordinator API for Webtruyenv2.

Coordinates remote GPU render workers (e.g. PC with NVIDIA RTX 5060)
to offload heavy TTS synthesis from the server CPU.
Provides endpoints for heartbeat, job polling, real-time progress, and completion.
"""

from __future__ import annotations

import datetime
import logging
import os
import shutil
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("worker_coordinator")

# Ensure local backend dir is in sys.path
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from config import settings
    from database import get_db
    from scheduler import JobProgress, coordinator, queue_manager
except ImportError:
    from backend.config import settings
    from backend.database import get_db
    from backend.scheduler import JobProgress, coordinator, queue_manager

router = APIRouter(prefix="/api/worker", tags=["worker"])


class HeartbeatPayload(BaseModel):
    worker_name: str = "PC-Worker"
    gpu_name: str = "NVIDIA GeForce RTX 5060"
    vram_gb: float = 8.0
    status: str = "idle"


class ProgressPayload(BaseModel):
    book_slug: str
    current_chapter: int
    total_chapters: int
    current_sentence: int
    total_sentences: int
    percent: int
    eta_seconds: Optional[int] = None
    message: str


class CompletePayload(BaseModel):
    book_slug: str
    success: bool
    chapters_done: int = 0
    error_msg: str = ""


@router.post("/heartbeat")
def worker_heartbeat(payload: HeartbeatPayload):
    coordinator.record_heartbeat(
        name=payload.worker_name,
        gpu_name=payload.gpu_name,
        vram_gb=payload.vram_gb,
        status=payload.status,
    )
    with queue_manager._lock:
        has_job = len(queue_manager._queue) > 0 and (
            queue_manager._current_job is None or queue_manager._current_job.status != "running"
        )
    return {"status": "ok", "has_job": has_job}


@router.get("/status")
def get_worker_status():
    return coordinator.get_status()


@router.post("/poll-job")
def poll_job():
    """Worker asks for the next queued job."""
    if not coordinator.is_online():
        return {"job": None}

    with queue_manager._lock:
        # Check if already running a job
        if queue_manager._current_job and queue_manager._current_job.status == "running":
            # If current job is already running on worker, don't assign another
            return {"job": None}

        if not queue_manager._queue:
            return {"job": None}

        job = queue_manager._queue.pop(0)

        book_slug = job["book_slug"]
        book_title = job.get("book_title", book_slug)
        start_ch = job.get("start_ch", 1)
        max_ch = job.get("max_ch", 50)
        voice = job.get("voice", "Ngọc Huyền")

        # Find source filename
        source_file = queue_manager._find_source_file(book_slug)
        source_filename = source_file.name if source_file else None

        # Setup current job progress on server
        progress = JobProgress(book_slug, book_title, voice, start_ch, max_ch)
        progress.message = f"⚡ Đang chuẩn bị render trên GPU PC ({coordinator.worker_info.get('gpu_name', 'RTX 5060')})..."
        queue_manager._current_job = progress

        # Update DB status
        try:
            with get_db() as conn:
                conn.execute(
                    "UPDATE admin_books SET status = 'rendering', updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
                    (book_slug,),
                )
        except Exception as e:
            logger.error(f"Error setting rendering in DB: {e}")

        queue_manager.add_log(
            f"⚡ Đã giao tác vụ render '{book_title}' (Chương {start_ch} -> {start_ch + max_ch - 1}) cho {coordinator.worker_info.get('gpu_name', 'PC GPU')}!"
        )

        return {
            "job": {
                "book_slug": book_slug,
                "book_title": book_title,
                "start_ch": start_ch,
                "max_ch": max_ch,
                "voice": voice,
                "source_filename": source_filename,
            }
        }


@router.post("/progress")
def report_progress(payload: ProgressPayload):
    """Receives live sentence-by-sentence progress from remote GPU worker."""
    coordinator.touch(status="rendering")
    with queue_manager._lock:
        job = queue_manager._current_job
        if not job or job.book_slug != payload.book_slug:
            return {"status": "ok", "cancelled": True}

        if job.cancelled:
            return {"status": "ok", "cancelled": True}

        # Update real-time fields
        job.current_chapter = payload.current_chapter
        job.total_chapters = payload.total_chapters
        job.current_sentence = payload.current_sentence
        job.total_sentences = payload.total_sentences
        job.percent = payload.percent
        job.eta_seconds = payload.eta_seconds
        job.message = payload.message

        return {"status": "ok", "cancelled": False}


class UploadChapterPayload(BaseModel):
    book_slug: str
    chapter_id: str
    html: str
    cues: Optional[List[Dict[str, Any]]] = None
    title: Optional[str] = None
    chapter_index: Optional[int] = None


@router.post("/upload-chapter")
def upload_chapter_text(payload: UploadChapterPayload):
    """Directly pushes chapter text and cues to server local SSD for instant web reading."""
    local_base = Path(settings.LOCAL_DATA_DIR)
    book_dir = local_base / payload.book_slug
    book_dir.mkdir(parents=True, exist_ok=True)

    html_path = book_dir / f"{payload.chapter_id}.html"
    html_path.write_text(payload.html, encoding="utf-8")

    if payload.cues:
        import json
        cues_path = book_dir / f"{payload.chapter_id}_cues.json"
        cues_path.write_text(json.dumps(payload.cues, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        with get_db() as conn:
            import re
            m_num = re.search(r"\d+", payload.chapter_id)
            parsed_idx = int(m_num.group(0)) if m_num else 1
            ch_idx = payload.chapter_index if payload.chapter_index is not None else parsed_idx
            ch_title = payload.title
            insert_title = ch_title if ch_title else f"Chương {ch_idx}"
            audio_url = f"/api/books/{payload.book_slug}/audio/{payload.chapter_id}"
            conn.execute(
                """
                INSERT INTO book_chapters (book_slug, chapter_id, chapter_index, title, has_audio, audio_url)
                VALUES (?, ?, ?, ?, 1, ?)
                ON CONFLICT(book_slug, chapter_id) DO UPDATE SET
                    has_audio = 1,
                    title = CASE
                        WHEN ? IS NOT NULL AND ? != '' THEN ?
                        ELSE book_chapters.title
                    END,
                    chapter_index = CASE
                        WHEN ? IS NOT NULL AND ? >= 0 THEN ?
                        ELSE book_chapters.chapter_index
                    END,
                    audio_url = excluded.audio_url
                """,
                (
                    payload.book_slug, payload.chapter_id, ch_idx, insert_title, audio_url,
                    ch_title, ch_title, ch_title,
                    payload.chapter_index, payload.chapter_index, payload.chapter_index,
                ),
            )
    except Exception as e:
        logger.error(f"Error updating book_chapters in DB: {e}")

    try:
        from main import clear_api_caches
        clear_api_caches(payload.book_slug)
    except Exception:
        pass

    return {"status": "ok", "chapter_id": payload.chapter_id}


@router.post("/complete")
def report_complete(payload: CompletePayload):
    """Receives completion notification from remote GPU worker."""
    with queue_manager._lock:
        job = queue_manager._current_job
        if not job or job.book_slug != payload.book_slug:
            return {"status": "ignored"}

        if payload.success:
            job.percent = 100
            job.status = "completed"
            queue_manager.add_log(
                f"🎉 GPU Worker đã hoàn thành xuất sắc render '{job.book_title}' ({payload.chapters_done} chương)!"
            )
            queue_manager._finish_job(job, success=True, chapters_done=payload.chapters_done)
            try:
                src_meta = Path(settings.AUDIOBOOKS_DIR) / payload.book_slug / "metadata.json"
                dst_meta = Path(settings.LOCAL_DATA_DIR) / payload.book_slug / "metadata.json"
                if src_meta.is_file():
                    dst_meta.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src_meta, dst_meta)
                from main import clear_api_caches
                clear_api_caches(payload.book_slug)
            except Exception:
                pass
        else:
            job.status = "failed"
            queue_manager.add_log(f"❌ GPU Worker báo lỗi khi render '{job.book_title}': {payload.error_msg}")
            queue_manager._finish_job(job, success=False, error_msg=payload.error_msg)

        return {"status": "ok"}
