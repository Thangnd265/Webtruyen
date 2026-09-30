import os
import sqlite3
from pathlib import Path

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
            CREATE TABLE IF NOT EXISTS admin_books (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT DEFAULT '',
                genres TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                voice TEXT DEFAULT 'Ngọc Huyền',
                daily_quota INTEGER DEFAULT 50,
                schedule_time TEXT DEFAULT '02:00',
                auto_render INTEGER DEFAULT 1,
                current_rendered_chapter INTEGER DEFAULT 0,
                total_chapters INTEGER DEFAULT 0,
                source_filename TEXT DEFAULT '',
                status TEXT DEFAULT 'idle',
                last_rendered_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
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
