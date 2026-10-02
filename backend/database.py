import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DB_DIR / "audioweb.db"


def get_db() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                avatar_color TEXT NOT NULL DEFAULT '#6366f1',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                book_slug TEXT NOT NULL,
                book_title TEXT NOT NULL,
                book_author TEXT DEFAULT '',
                book_cover TEXT DEFAULT '',
                chapter_id TEXT NOT NULL,
                chapter_title TEXT NOT NULL,
                current_time REAL DEFAULT 0.0,
                duration REAL DEFAULT 0.0,
                progress REAL DEFAULT 0.0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, book_slug)
            );
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_history_user_updated 
            ON user_history(user_id, updated_at DESC);
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id INTEGER PRIMARY KEY,
                preferences_json TEXT NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_books (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT DEFAULT '',
                description TEXT DEFAULT '',
                genres TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                banner_url TEXT DEFAULT '',
                banner_position TEXT DEFAULT 'center 20%',
                voice TEXT DEFAULT 'Ngọc Huyền',
                daily_quota INTEGER DEFAULT 50,
                schedule_time TEXT DEFAULT '02:00',
                auto_render INTEGER DEFAULT 1,
                current_rendered_chapter INTEGER DEFAULT 0,
                total_chapters INTEGER DEFAULT 0,
                source_filename TEXT DEFAULT '',
                status TEXT DEFAULT 'idle',
                publication_status TEXT DEFAULT 'Đang ra',
                views INTEGER DEFAULT 18500,
                rating REAL DEFAULT 4.8,
                last_rendered_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS book_chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_slug TEXT NOT NULL,
                chapter_id TEXT NOT NULL,
                chapter_index INTEGER NOT NULL,
                title TEXT NOT NULL,
                has_audio INTEGER DEFAULT 0,
                audio_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(book_slug, chapter_id)
            );
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_book_chapters_lookup 
            ON book_chapters(book_slug, chapter_index ASC);
        """)
        # Auto-migrate existing admin_books table if columns are missing
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(admin_books)").fetchall()]
        if "banner_url" not in cols:
            conn.execute("ALTER TABLE admin_books ADD COLUMN banner_url TEXT DEFAULT '';")
        if "banner_position" not in cols:
            conn.execute("ALTER TABLE admin_books ADD COLUMN banner_position TEXT DEFAULT 'center 20%';")
        if "description" not in cols:
            conn.execute("ALTER TABLE admin_books ADD COLUMN description TEXT DEFAULT '';")
        if "publication_status" not in cols:
            conn.execute("ALTER TABLE admin_books ADD COLUMN publication_status TEXT DEFAULT 'Đang ra';")
        if "views" not in cols:
            conn.execute("ALTER TABLE admin_books ADD COLUMN views INTEGER DEFAULT 18500;")
        if "rating" not in cols:
            conn.execute("ALTER TABLE admin_books ADD COLUMN rating REAL DEFAULT 4.8;")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS render_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_slug TEXT NOT NULL,
                book_title TEXT NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP,
                chapter_start INTEGER DEFAULT 1,
                chapter_end INTEGER DEFAULT 1,
                chapters_processed INTEGER DEFAULT 0,
                sentences_processed INTEGER DEFAULT 0,
                duration_seconds REAL DEFAULT 0.0,
                status TEXT DEFAULT 'success',
                log_output TEXT DEFAULT '',
                error_message TEXT DEFAULT ''
            );
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_render_logs_started 
            ON render_logs(started_at DESC);
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        # Insert default settings if not exists
        conn.execute("""
            INSERT OR IGNORE INTO admin_settings (key, value)
            VALUES ('admin_pin', '123456');
        """)
        conn.execute("""
            INSERT OR IGNORE INTO admin_settings (key, value)
            VALUES ('default_voice', 'Ngọc Huyền');
        """)
        # Auto-recover any stale 'rendering' books left by sudden power loss or server crash
        conn.execute("UPDATE admin_books SET status = 'idle' WHERE status = 'rendering';")


def sync_disk_books_to_sql(audiobooks_dir: Path, local_data_dir: Optional[Path] = None) -> int:
    """Scans storage directories and populates SQLite database with any books or chapters not yet in SQL."""
    import json
    import re

    imported_count = 0
    search_dirs = []
    if local_data_dir and local_data_dir.exists():
        search_dirs.append(local_data_dir)
    if audiobooks_dir and audiobooks_dir.exists() and audiobooks_dir != local_data_dir:
        search_dirs.append(audiobooks_dir)

    with get_db() as conn:
        existing_slugs = {r[0] for r in conn.execute("SELECT slug FROM admin_books").fetchall()}

        for s_dir in search_dirs:
            try:
                for item in s_dir.iterdir():
                    if not item.is_dir():
                        continue
                    slug = item.name
                    if slug.startswith(".") or slug in ("voices", "models", "lost+found", "incoming_books"):
                        continue

                    # Read metadata.json if available
                    meta = {}
                    meta_file = item / "metadata.json"
                    if meta_file.is_file():
                        try:
                            meta = json.loads(meta_file.read_text(encoding="utf-8"))
                        except Exception:
                            meta = {}

                    title = meta.get("title") or slug.replace("-", " ").title()
                    author = meta.get("author") or "Ẩn danh"
                    description = meta.get("description") or ""
                    genres = meta.get("genres") or meta.get("genre") or "Huyền Huyễn, Tiên Hiệp"
                    cover_url = meta.get("cover_url") or f"/api/books/{slug}/cover"
                    voice = meta.get("voice") or "Ngọc Huyền"
                    status = meta.get("status") or "Đang ra"
                    views = meta.get("views") or 18500
                    rating = meta.get("rating") or 4.8
                    total_chapters = meta.get("total_chapters") or 0

                    if slug not in existing_slugs:
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO admin_books (
                                slug, title, author, description, genres, cover_url, voice,
                                total_chapters, status, publication_status, views, rating
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?)
                            """,
                            (slug, title, author, description, genres, cover_url, voice, total_chapters, status, views, rating),
                        )
                        existing_slugs.add(slug)
                        imported_count += 1
                    else:
                        conn.execute(
                            """
                            UPDATE admin_books SET
                                description = CASE WHEN (description IS NULL OR description = '') THEN ? ELSE description END,
                                genres = CASE WHEN (genres IS NULL OR genres = '') THEN ? ELSE genres END,
                                publication_status = CASE WHEN (publication_status IS NULL OR publication_status = '') THEN ? ELSE publication_status END
                            WHERE slug = ?
                            """,
                            (description, genres, status, slug),
                        )

                    # Ensure chapters are synced into book_chapters
                    ch_count = conn.execute("SELECT COUNT(*) FROM book_chapters WHERE book_slug = ?", (slug,)).fetchone()[0]
                    if ch_count == 0:
                        chapters_to_insert = []
                        if meta.get("chapters") and isinstance(meta["chapters"], list):
                            for i, ch in enumerate(meta["chapters"]):
                                ch_id = ch.get("id") or f"chapter_{str(i+1).zfill(3)}"
                                ch_idx = ch.get("chapter_index") if ch.get("chapter_index") is not None else (i + 1)
                                ch_title = ch.get("title") or ("Giới Thiệu" if ch_idx == 0 else f"Chương {ch_idx}")
                                has_audio = 1 if (ch.get("has_audio") or (item / f"{ch_id}.m4b").is_file() or (item / f"{ch_id}.mp3").is_file()) else 0
                                chapters_to_insert.append((slug, ch_id, ch_idx, ch_title, has_audio, f"/api/books/{slug}/audio/{ch_id}"))
                        else:
                            for f in item.iterdir():
                                if f.is_file():
                                    m = re.match(r"^(chapter[_\-]?\d+)", f.stem, re.IGNORECASE)
                                    if m:
                                        ch_id = m.group(1)
                                        num_m = re.search(r"\d+", ch_id)
                                        ch_idx = int(num_m.group(0)) if num_m else 1
                                        ch_title = f"Chương {ch_idx}"
                                        has_audio = 1 if f.suffix.lower() in (".m4b", ".mp3", ".aac", ".wav") else 0
                                        chapters_to_insert.append((slug, ch_id, ch_idx, ch_title, has_audio, f"/api/books/{slug}/audio/{ch_id}"))

                        if chapters_to_insert:
                            # deduplicate by chapter_id
                            seen_ch = set()
                            unique_chapters = []
                            for row in chapters_to_insert:
                                if row[1] not in seen_ch:
                                    seen_ch.add(row[1])
                                    unique_chapters.append(row)
                            conn.executemany(
                                """
                                INSERT OR IGNORE INTO book_chapters (book_slug, chapter_id, chapter_index, title, has_audio, audio_url)
                                VALUES (?, ?, ?, ?, ?, ?)
                                """,
                                unique_chapters,
                            )
                            if total_chapters == 0:
                                conn.execute("UPDATE admin_books SET total_chapters = ? WHERE slug = ?", (len(unique_chapters), slug))

            except Exception:
                pass

    return imported_count

