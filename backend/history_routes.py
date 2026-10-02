from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

try:
    from auth import get_current_user
    from database import get_db
except ImportError:
    from backend.auth import get_current_user
    from backend.database import get_db

router = APIRouter(prefix="/api/user/history", tags=["user_history"])


class HistoryItem(BaseModel):
    book_slug: str
    book_title: str
    book_author: Optional[str] = ""
    book_cover: Optional[str] = ""
    chapter_id: str
    chapter_title: str
    current_time: Optional[float] = 0.0
    duration: Optional[float] = 0.0
    progress: Optional[float] = 0.0


class BulkSyncRequest(BaseModel):
    items: List[HistoryItem]


@router.get("")
def get_user_history(
    limit: int = Query(20, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT book_slug, book_title, book_author, book_cover,
                   chapter_id, chapter_title, current_time, duration, progress, updated_at
            FROM user_history
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (user["id"], limit)
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{book_slug}")
def get_book_history(
    book_slug: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT book_slug, book_title, book_author, book_cover,
                   chapter_id, chapter_title, current_time, duration, progress, updated_at
            FROM user_history
            WHERE user_id = ? AND book_slug = ?
            """,
            (user["id"], book_slug)
        ).fetchone()
        if not row:
            return None
        return dict(row)


@router.post("")
def save_history_item(
    item: HistoryItem,
    user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO user_history (
                user_id, book_slug, book_title, book_author, book_cover,
                chapter_id, chapter_title, current_time, duration, progress, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, book_slug) DO UPDATE SET
                book_title = excluded.book_title,
                book_author = excluded.book_author,
                book_cover = excluded.book_cover,
                chapter_id = excluded.chapter_id,
                chapter_title = excluded.chapter_title,
                current_time = CASE 
                    WHEN excluded.chapter_id = user_history.chapter_id AND (excluded.current_time IS NULL OR excluded.current_time = 0) 
                    THEN user_history.current_time 
                    ELSE excluded.current_time 
                END,
                duration = CASE 
                    WHEN excluded.chapter_id = user_history.chapter_id AND (excluded.duration IS NULL OR excluded.duration = 0) 
                    THEN user_history.duration 
                    ELSE excluded.duration 
                END,
                progress = CASE
                    WHEN excluded.progress IS NOT NULL AND excluded.progress > 0 
                    THEN excluded.progress
                    ELSE user_history.progress
                END,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                user["id"], item.book_slug, item.book_title, item.book_author, item.book_cover,
                item.chapter_id, item.chapter_title, item.current_time, item.duration, item.progress
            )
        )
        conn.commit()
    return {"status": "ok"}


@router.post("/sync-bulk")
def bulk_sync_history(
    req: BulkSyncRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    synced_count = 0
    with get_db() as conn:
        for item in req.items:
            conn.execute(
                """
                INSERT INTO user_history (
                    user_id, book_slug, book_title, book_author, book_cover,
                    chapter_id, chapter_title, current_time, duration, progress, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, book_slug) DO UPDATE SET
                    book_title = excluded.book_title,
                    book_author = excluded.book_author,
                    book_cover = excluded.book_cover,
                    chapter_id = excluded.chapter_id,
                    chapter_title = excluded.chapter_title,
                    current_time = CASE 
                        WHEN excluded.chapter_id = user_history.chapter_id AND (excluded.current_time IS NULL OR excluded.current_time = 0) 
                        THEN user_history.current_time 
                        ELSE excluded.current_time 
                    END,
                    duration = CASE 
                        WHEN excluded.chapter_id = user_history.chapter_id AND (excluded.duration IS NULL OR excluded.duration = 0) 
                        THEN user_history.duration 
                        ELSE excluded.duration 
                    END,
                    progress = CASE
                        WHEN excluded.progress IS NOT NULL AND excluded.progress > 0 
                        THEN excluded.progress
                        ELSE user_history.progress
                    END,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    user["id"], item.book_slug, item.book_title, item.book_author, item.book_cover,
                    item.chapter_id, item.chapter_title, item.current_time, item.duration, item.progress
                )
            )
            synced_count += 1
        conn.commit()
    return {"synced_count": synced_count}


@router.delete("/{book_slug}")
def delete_history_item(
    book_slug: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM user_history WHERE user_id = ? AND book_slug = ?",
            (user["id"], book_slug)
        )
        conn.commit()
    return {"status": "ok"}


@router.delete("")
def clear_all_history(
    user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db() as conn:
        conn.execute("DELETE FROM user_history WHERE user_id = ?", (user["id"],))
        conn.commit()
    return {"status": "ok"}

