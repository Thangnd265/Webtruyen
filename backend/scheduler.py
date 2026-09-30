"""Audiobook Background Queue Runner and Schedule Manager for Webtruyenv2.

Manages:
1. Sequential Render Queue (preventing CPU overload).
2. Live Progress tracking (chapter, sentence %, ETA).
3. Daily Quota Cron Scheduler (auto-triggering daily chapter batches at scheduled time).
4. Chapter-level re-rendering.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("webtruyen_scheduler")

# Ensure paths
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from config import settings
    from database import get_db
except ImportError:
    from backend.config import settings
    from backend.database import get_db


class JobProgress:
    def __init__(self, book_slug: str, book_title: str, voice: str, start_ch: int, max_ch: int):
        self.book_slug = book_slug
        self.book_title = book_title
        self.voice = voice
        self.start_ch = start_ch
        self.max_ch = max_ch
        self.current_chapter = start_ch
        self.total_chapters = max_ch
        self.current_sentence = 0
        self.total_sentences = 0
        self.percent = 0
        self.status = "running"
        self.start_time = time.time()
        self.message = "Đang khởi tạo mô hình TTS..."
        self.eta_seconds: Optional[int] = None
        self.cancelled = False

    def to_dict(self) -> Dict[str, Any]:
        elapsed = round(time.time() - self.start_time, 1)
        return {
            "book_slug": self.book_slug,
            "book_title": self.book_title,
            "voice": self.voice,
            "start_chapter": self.start_ch,
            "current_chapter": self.current_chapter,
            "total_chapters": self.total_chapters,
            "current_sentence": self.current_sentence,
            "total_sentences": self.total_sentences,
            "percent": self.percent,
            "status": self.status,
            "elapsed_seconds": elapsed,
            "eta_seconds": self.eta_seconds,
            "message": self.message,
        }


class QueueManager:
    def __init__(self):
        self._queue: List[Dict[str, Any]] = []
        self._current_job: Optional[JobProgress] = None
        self._lock = threading.Lock()
        self._worker_thread: Optional[threading.Thread] = None
        self._running = False
        self._recent_logs: List[str] = []
        self._max_recent_logs = 200

    def add_log(self, line: str):
        with self._lock:
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            entry = f"[{ts}] {line}"
            self._recent_logs.append(entry)
            if len(self._recent_logs) > self._max_recent_logs:
                self._recent_logs.pop(0)

    def get_recent_logs(self) -> List[str]:
        with self._lock:
            return list(self._recent_logs)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "is_busy": self._current_job is not None and self._current_job.status == "running",
                "current_job": self._current_job.to_dict() if self._current_job else None,
                "pending_queue": [
                    {
                        "book_slug": item["book_slug"],
                        "book_title": item.get("book_title", item["book_slug"]),
                        "voice": item.get("voice", "Ngọc Huyền"),
                        "start_ch": item.get("start_ch", 1),
                        "max_ch": item.get("max_ch", 50),
                    }
                    for item in self._queue
                ],
                "queue_length": len(self._queue),
            }

    def enqueue(
        self,
        book_slug: str,
        book_title: str,
        start_ch: int = 1,
        max_ch: int = 50,
        voice: str = "Ngọc Huyền",
        priority: bool = False,
    ) -> bool:
        with self._lock:
            # Avoid duplicate in pending queue
            for item in self._queue:
                if item["book_slug"] == book_slug:
                    return False
            if self._current_job and self._current_job.book_slug == book_slug and self._current_job.status == "running":
                return False

            job_spec = {
                "book_slug": book_slug,
                "book_title": book_title,
                "start_ch": start_ch,
                "max_ch": max_ch,
                "voice": voice,
            }
            if priority:
                self._queue.insert(0, job_spec)
            else:
                self._queue.append(job_spec)

            self.add_log(f"📥 Đã thêm '{book_title}' vào hàng đợi (Chương {start_ch}, số lượng: {max_ch}).")

            # Update book status in DB
            try:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE admin_books SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
                        (book_slug,),
                    )
            except Exception as e:
                logger.error(f"Error updating book status: {e}")

        self.ensure_worker()
        return True

    def cancel_current(self) -> bool:
        with self._lock:
            if self._current_job and self._current_job.status == "running":
                self._current_job.cancelled = True
                self._current_job.status = "cancelled"
                self.add_log(f"🛑 Đã gửi lệnh huỷ tác vụ: {self._current_job.book_title}")
                return True
        return False

    def remove_from_queue(self, book_slug: str) -> bool:
        with self._lock:
            for i, item in enumerate(self._queue):
                if item["book_slug"] == book_slug:
                    self._queue.pop(i)
                    self.add_log(f"🗑️ Đã xoá '{book_slug}' khỏi hàng đợi.")
                    try:
                        with get_db() as conn:
                            conn.execute(
                                "UPDATE admin_books SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
                                (book_slug,),
                            )
                    except Exception:
                        pass
                    return True
        return False

    def ensure_worker(self):
        if not self._running or self._worker_thread is None or not self._worker_thread.is_alive():
            self._running = True
            self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
            self._worker_thread.start()

    def _worker_loop(self):
        while self._running:
            job = None
            with self._lock:
                if self._queue:
                    job = self._queue.pop(0)

            if not job:
                time.sleep(2)
                continue

            self._execute_job(job)
            time.sleep(1)

    def _find_source_file(self, book_slug: str) -> Optional[Path]:
        """Finds the source text/epub for a book in incoming_books or audiobooks dir."""
        audiobooks_dir = Path(settings.AUDIOBOOKS_DIR).resolve()
        candidates_dirs = [
            audiobooks_dir / "incoming_books",
            audiobooks_dir / "incoming_books" / "done",
            audiobooks_dir / book_slug,
            root_dir / "incoming_books",
            root_dir / "incoming_books" / "done",
        ]

        extensions = [".epub", ".txt", ".mobi", ".pdf", ".docx", ".fb2", ".prc", ".azw3"]
        for d in candidates_dirs:
            if not d.is_dir():
                continue
            for ext in extensions:
                # Direct match with slug
                target = d / f"{book_slug}{ext}"
                if target.is_file():
                    return target
                # Pattern match
                for f in d.glob(f"*{ext}"):
                    if book_slug in f.stem.lower().replace("_", "-").replace(" ", "-"):
                        return f
        return None

    def _execute_job(self, job: Dict[str, Any]):
        book_slug = job["book_slug"]
        book_title = job.get("book_title", book_slug)
        start_ch = job.get("start_ch", 1)
        max_ch = job.get("max_ch", 50)
        voice = job.get("voice", "Ngọc Huyền")

        progress = JobProgress(book_slug, book_title, voice, start_ch, max_ch)
        with self._lock:
            self._current_job = progress

        # Update DB to rendering
        try:
            with get_db() as conn:
                conn.execute(
                    "UPDATE admin_books SET status = 'rendering', updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
                    (book_slug,),
                )
        except Exception:
            pass

        self.add_log(f"🚀 Bắt đầu render '{book_title}': Chương {start_ch} -> {start_ch + max_ch - 1}, Giọng: {voice}")

        source_file = self._find_source_file(book_slug)
        if not source_file:
            err = f"Không tìm thấy file nguồn (.epub/.txt) của '{book_slug}' để tiếp tục render."
            self.add_log(f"❌ {err}")
            progress.status = "failed"
            progress.message = err
            self._finish_job(progress, success=False, error_msg=err)
            return

        try:
            # We run python pipeline/generate_audiobook.py in a subprocess with streaming output
            # Check if running in container or host environment
            python_bin = sys.executable
            # If on host CT 301 with virtualenv:
            if Path("/root/vieneu-env/bin/python3").is_file():
                python_bin = "/root/vieneu-env/bin/python3"

            gen_script = str(root_dir / "pipeline" / "generate_audiobook.py")
            cmd = [
                python_bin,
                gen_script,
                str(source_file),
                "--slug", book_slug,
                "--title", book_title,
                "--output-dir", settings.AUDIOBOOKS_DIR,
                "--voice", voice,
                "--start-chapter", str(start_ch),
                "--max-chapters", str(max_ch),
                "--bitrate", "64k",
            ]

            self.add_log(f"⚙️ Chạy tiến trình: {' '.join(cmd[:4])} ...")

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            ch_processed = 0
            lines_output: List[str] = []

            for line in iter(process.stdout.readline, ""):
                if not line:
                    break
                lines_output.append(line.strip())
                if progress.cancelled:
                    process.terminate()
                    break

                # Parse log for progress cues
                # E.g. "Processing chapter 2/5: 12/40 sentences"
                if "Successfully processed chapter_" in line:
                    ch_processed += 1
                    progress.current_chapter = start_ch + ch_processed
                    progress.percent = min(100, int((ch_processed / max_ch) * 100))
                    self.add_log(f"✅ Hoàn thành chương {progress.current_chapter - 1}")

                # Calculate ETA based on speed (~3.5s per cue or elapsed)
                elapsed = time.time() - progress.start_time
                if ch_processed > 0:
                    time_per_ch = elapsed / ch_processed
                    rem_ch = max(0, max_ch - ch_processed)
                    progress.eta_seconds = int(time_per_ch * rem_ch)

            process.wait()

            if progress.cancelled:
                self.add_log(f"🛑 Đã hủy render '{book_title}'")
                self._finish_job(progress, success=False, error_msg="Cancelled by user")
            elif process.returncode == 0:
                progress.percent = 100
                progress.status = "completed"
                self.add_log(f"🎉 Hoàn thành xuất sắc render '{book_title}' ({ch_processed} chương)!")
                self._finish_job(progress, success=True, chapters_done=ch_processed)
            else:
                tail_err = "\n".join(lines_output[-5:])
                err = f"Tiến trình kết thúc với mã lỗi {process.returncode}: {tail_err}"
                self.add_log(f"❌ {err}")
                self._finish_job(progress, success=False, error_msg=err)

        except Exception as exc:
            err = f"Lỗi ngoại lệ: {exc}"
            self.add_log(f"❌ {err}")
            self._finish_job(progress, success=False, error_msg=err)

    def _finish_job(
        self,
        progress: JobProgress,
        success: bool,
        chapters_done: int = 0,
        error_msg: str = "",
    ):
        status_str = "completed" if success else ("cancelled" if progress.cancelled else "error")
        duration = round(time.time() - progress.start_time, 1)

        # Update DB
        try:
            with get_db() as conn:
                # Update admin_books
                if success and chapters_done > 0:
                    conn.execute(
                        """
                        UPDATE admin_books 
                        SET current_rendered_chapter = current_rendered_chapter + ?,
                            status = 'idle',
                            last_rendered_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE slug = ?
                        """,
                        (chapters_done, progress.book_slug),
                    )
                else:
                    conn.execute(
                        "UPDATE admin_books SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
                        (status_str, progress.book_slug),
                    )

                # Record in render_logs
                conn.execute(
                    """
                    INSERT INTO render_logs (
                        book_slug, book_title, started_at, finished_at,
                        chapter_start, chapter_end, chapters_processed,
                        duration_seconds, status, error_message
                    ) VALUES (?, ?, datetime(?,'unixepoch'), CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        progress.book_slug,
                        progress.book_title,
                        int(progress.start_time),
                        progress.start_ch,
                        progress.start_ch + chapters_done - 1 if chapters_done > 0 else progress.start_ch,
                        chapters_done,
                        duration,
                        "success" if success else "failed",
                        error_msg,
                    ),
                )
        except Exception as e:
            logger.error(f"Error finishing job in DB: {e}")

        with self._lock:
            self._current_job = None


# Global queue manager instance
queue_manager = QueueManager()


async def cron_schedule_checker():
    """Async background task that periodically checks schedule_time for auto_render books."""
    logger.info("⏱️ Daily Quota Cron Checker activated.")
    last_checked_minute = ""

    while True:
        try:
            now = datetime.datetime.now()
            current_hm = now.strftime("%H:%M")

            if current_hm != last_checked_minute:
                last_checked_minute = current_hm

                with get_db() as conn:
                    # Find all books configured for auto_render at current time
                    cursor = conn.execute(
                        """
                        SELECT slug, title, voice, daily_quota, current_rendered_chapter, total_chapters
                        FROM admin_books
                        WHERE auto_render = 1 AND schedule_time = ? AND status != 'rendering'
                        """,
                        (current_hm,),
                    )
                    books_to_run = cursor.fetchall()

                for book in books_to_run:
                    curr_ch = book["current_rendered_chapter"]
                    tot_ch = book["total_chapters"]
                    quota = book["daily_quota"] or 50

                    if tot_ch > 0 and curr_ch >= tot_ch:
                        continue  # Book already finished

                    next_start = curr_ch + 1
                    logger.info(
                        f"⏰ Đến giờ hẹn {current_hm}: Tự động kích hoạt '{book['title']}' (Chương {next_start}, quota: {quota})."
                    )
                    queue_manager.enqueue(
                        book_slug=book["slug"],
                        book_title=book["title"],
                        start_ch=next_start,
                        max_ch=quota,
                        voice=book["voice"] or "Ngọc Huyền",
                    )

        except Exception as e:
            logger.error(f"Cron checker error: {e}")

        await asyncio.sleep(30)
