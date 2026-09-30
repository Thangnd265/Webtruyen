# Authentication and Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement user registration, login, JWT session management, and cross-device listening/reading progress personalization with SQLite backend and seamless frontend sync.

**Architecture:** A lightweight SQLite database (`backend/data/audioweb.db`) stores user credentials (PBKDF2-HMAC-SHA256 salted hashes) and per-user playback/reading history. FastAPI endpoints issue HMAC-SHA256 JWTs and provide history CRUD/sync. The frontend (`frontend/js/auth.js`) manages auth state, renders an accessible modal and user dropdown in the navbar, and synchronizes `localStorage` history to the account.

**Tech Stack:** Python 3.12, FastAPI, SQLite3 (Python stdlib), PBKDF2 / HMAC-SHA256 (Python stdlib `hashlib`, `hmac`, `secrets`), Vanilla JavaScript (ES6+), HTML5/CSS3.

**Spec:** [docs/superpowers/specs/2026-09-30-auth-and-personalization-design.md](file:///d:/HuySpace/Audio_Web/docs/superpowers/specs/2026-09-30-auth-and-personalization-design.md)

## Global Constraints
- Python stdlib only for crypto and database (`hashlib`, `hmac`, `secrets`, `sqlite3`, `json`, `base64`) to eliminate external binary dependency issues on Windows.
- SQLite database location is `backend/data/audioweb.db`; directory must be auto-created if absent.
- Backward compatibility: Guests continue using `localStorage` without interruption.
- Responsive & theme-aware: Auth modal and navbar user menu must strictly adapt to CSS variables (`--bg-primary`, `--bg-surface`, `--text-primary`, `--border`, `--accent`).
- Backend runs with uvicorn reload on port 3080; endpoints tested via `Invoke-RestMethod`.

## Review Focus
1. Duplicate username registration -> Expect HTTP 400 with clear Vietnamese error message: "Tên đăng nhập đã tồn tại".
2. Wrong password on login -> Expect HTTP 401 with message: "Tên đăng nhập hoặc mật khẩu không chính xác".
3. Expired or tampered JWT token in `Authorization: Bearer <token>` -> Expect HTTP 401 with token rejection, client clearing expired token.
4. History upsert for existing `(user_id, book_slug)` -> Updates chapter, progress, time and `updated_at` without duplicating rows.
5. Migration on first login -> Items in `localStorage['audioweb-recent-history']` are bulk synced to server without losing offline progress.

---

### Task 1: SQLite Database Scaffolding & Migrations

**Files:**
- Create: `backend/database.py`
- Test: `Invoke-RestMethod` or python script verification

**Interfaces:**
- Consumes: None
- Produces:
  - `get_db_connection() -> sqlite3.Connection`
  - `init_db() -> None`

- [ ] **Step 1: Write database module with schema initialization**

Create `backend/database.py` with thread-safe SQLite connection factory and schema creation:

```python
import os
import sqlite3
from pathlib import Path
from typing import Generator

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
```

- [ ] **Step 2: Connect `init_db()` into `backend/main.py` startup event**

In `backend/main.py`:
```python
from database import init_db

@app.on_event("startup")
def on_startup():
    init_db()
```

- [ ] **Step 3: Verify database file is created and tables exist**

Run via PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:3080/api/health"
Test-Path "backend/data/audioweb.db"
```
Expected: `True`

---

### Task 2: Auth Security & Token Helpers

**Files:**
- Create: `backend/auth.py`
- Test: Verification via internal helper calls

**Interfaces:**
- Consumes: `backend/database.py` (`get_db`)
- Produces:
  - `hash_password(password: str) -> str`
  - `verify_password(password: str, hashed: str) -> bool`
  - `create_access_token(user_id: int, username: str) -> str`
  - `decode_access_token(token: str) -> Optional[dict]`
  - `get_current_user(authorization: Optional[str]) -> dict` (FastAPI dependency)

- [ ] **Step 1: Implement password hashing and JWT encoding/decoding**

Create `backend/auth.py`:

```python
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, Optional
from fastapi import HTTPException, Header

SECRET_KEY = os.environ.get("AUDIOWEB_JWT_SECRET", "audioweb-dev-secret-key-32chars-min!!")
TOKEN_EXPIRY_SECONDS = 30 * 24 * 3600  # 30 days

AVATAR_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", 
    "#f97316", "#eab308", "#10b981", "#06b6d4", "#3b82f6"
]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, key_hex = stored.split("$", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def create_access_token(user_id: int, username: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "username": username,
        "exp": int(time.time()) + TOKEN_EXPIRY_SECONDS,
        "iat": int(time.time())
    }
    h_str = _b64encode(json.dumps(header).encode("utf-8"))
    p_str = _b64encode(json.dumps(payload).encode("utf-8"))
    signature = hmac.new(SECRET_KEY.encode("utf-8"), f"{h_str}.{p_str}".encode("utf-8"), hashlib.sha256).digest()
    s_str = _b64encode(signature)
    return f"{h_str}.{p_str}.{s_str}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h_str, p_str, s_str = parts
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), f"{h_str}.{p_str}".encode("utf-8"), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64encode(expected_sig), s_str):
            return None
        payload = json.loads(_b64decode(p_str).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
```

- [ ] **Step 2: Add `get_current_user` and `get_optional_user` dependencies**

In `backend/auth.py`:

```python
from database import get_db

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Thiếu hoặc sai định dạng token xác thực")
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token không hợp lệ hoặc đã hết hạn")
    
    with get_db() as conn:
        row = conn.execute("SELECT id, username, display_name, avatar_color FROM users WHERE id = ?", (payload["sub"],)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Người dùng không tồn tại")
        return dict(row)


def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        return None
    with get_db() as conn:
        row = conn.execute("SELECT id, username, display_name, avatar_color FROM users WHERE id = ?", (payload["sub"],)).fetchone()
        return dict(row) if row else None
```

---

### Task 3: Auth Endpoints (`register`, `login`, `me`)

**Files:**
- Create: `backend/auth_routes.py`
- Modify: `backend/main.py`
- Test: PowerShell `Invoke-RestMethod`

**Interfaces:**
- Consumes: `backend/database.py`, `backend/auth.py`
- Produces:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`

- [ ] **Step 1: Write auth routes in `backend/auth_routes.py`**

```python
import random
import re
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import (
    AVATAR_COLORS,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=6, max_length=100)
    display_name: str = Field(..., min_length=1, max_length=50)


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
def register(req: RegisterRequest):
    username = req.username.strip()
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        raise HTTPException(status_code=400, detail="Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới")
    
    display_name = req.display_name.strip()
    password_hash = hash_password(req.password)
    avatar_color = random.choice(AVATAR_COLORS)

    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Tên đăng nhập đã tồn tại")
        
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, display_name, avatar_color) VALUES (?, ?, ?, ?)",
            (username, password_hash, display_name, avatar_color)
        )
        conn.commit()
        user_id = cursor.lastrowid

    token = create_access_token(user_id, username)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "username": username,
            "display_name": display_name,
            "avatar_color": avatar_color,
        }
    }


@router.post("/login")
def login(req: LoginRequest):
    username = req.username.strip()
    with get_db() as conn:
        user = conn.execute(
            "SELECT id, username, password_hash, display_name, avatar_color FROM users WHERE username = ?",
            (username,)
        ).fetchone()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không chính xác")

    token = create_access_token(user["id"], user["username"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "avatar_color": user["avatar_color"],
        }
    }


@router.get("/me")
def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    return user
```

- [ ] **Step 2: Mount `auth_routes.router` in `backend/main.py`**

Include router in `backend/main.py` before `app.mount("/", ...)`:
```python
from auth_routes import router as auth_router
app.include_router(auth_router)
```

- [ ] **Step 3: Test register, login, and me endpoints via PowerShell**

```powershell
$regBody = @{ username = "testuser"; password = "password123"; display_name = "Thử Nghiệm" } | ConvertTo-Json
$regRes = Invoke-RestMethod -Uri "http://localhost:3080/api/auth/register" -Method Post -Body $regBody -ContentType "application/json"
$token = $regRes.token

$meRes = Invoke-RestMethod -Uri "http://localhost:3080/api/auth/me" -Headers @{ Authorization = "Bearer $token" }
Write-Output $meRes.display_name
```
Expected: `Thử Nghiệm`

---

### Task 4: User History & Personalization Endpoints

**Files:**
- Create: `backend/history_routes.py`
- Modify: `backend/main.py`
- Test: PowerShell `Invoke-RestMethod`

**Interfaces:**
- Consumes: `backend/database.py`, `backend/auth.py`
- Produces:
  - `GET /api/user/history`
  - `POST /api/user/history`
  - `POST /api/user/history/sync-bulk`

- [ ] **Step 1: Write history endpoints in `backend/history_routes.py`**

```python
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from database import get_db

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
                current_time = excluded.current_time,
                duration = excluded.duration,
                progress = excluded.progress,
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
                    current_time = excluded.current_time,
                    duration = excluded.duration,
                    progress = excluded.progress,
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
```

- [ ] **Step 2: Mount `history_routes.router` in `backend/main.py`**

Include router in `backend/main.py`:
```python
from history_routes import router as history_router
app.include_router(history_router)
```

- [ ] **Step 3: Test saving and querying history via PowerShell**

```powershell
$histItem = @{
    book_slug = "test-book"
    book_title = "Truyện Thử Nghiệm"
    chapter_id = "chuong-1"
    chapter_title = "Chương 1: Mở Đầu"
    current_time = 120.0
    duration = 600.0
    progress = 20.0
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3080/api/user/history" -Method Post -Body $histItem -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" }
$historyList = Invoke-RestMethod -Uri "http://localhost:3080/api/user/history" -Headers @{ Authorization = "Bearer $token" }
Write-Output $historyList[0].book_slug
```
Expected: `test-book`

---

### Task 5: Frontend Auth Client & State Management

**Files:**
- Create: `frontend/js/auth.js`
- Test: Inspect auth state handling in browser/unit simulation

**Interfaces:**
- Consumes: Backend `/api/auth/*` and `/api/user/history/*`
- Produces:
  - `window.authManager` instance:
    - `getToken()`
    - `getUser()`
    - `isLoggedIn()`
    - `login(username, password)`
    - `register(username, password, displayName)`
    - `logout()`
    - `openModal(mode)`
    - `closeModal()`
    - `syncLocalHistoryToServer()`
    - `saveProgress(historyItem)`

- [ ] **Step 1: Write `frontend/js/auth.js`**

Implement complete client-side manager with event broadcasting (`audioweb:auth-changed`), token caching in `localStorage['audioweb-token']`, user object in `localStorage['audioweb-user']`, automatic bulk sync of `audioweb-recent-history` on login, and dynamic UI updates for buttons/avatars.

```javascript
// frontend/js/auth.js
(function() {
  'use strict';

  class AuthManager {
    constructor() {
      this.TOKEN_KEY = 'audioweb-token';
      this.USER_KEY = 'audioweb-user';
      this.LOCAL_HISTORY_KEY = 'audioweb-recent-history';
      this.token = localStorage.getItem(this.TOKEN_KEY) || null;
      this.user = null;
      try {
        const u = localStorage.getItem(this.USER_KEY);
        if (u) this.user = JSON.parse(u);
      } catch (e) {
        this.user = null;
      }
      this.init();
    }

    init() {
      // Verify token on load if exists
      if (this.token) {
        this.fetchCurrentUser().catch(() => {
          this.logout();
        });
      }
      document.addEventListener('DOMContentLoaded', () => {
        this.renderNavbarAuthUI();
        this.setupModalListeners();
      });
    }

    isLoggedIn() {
      return !!this.token && !!this.user;
    }

    getToken() {
      return this.token;
    }

    getUser() {
      return this.user;
    }

    async fetchCurrentUser() {
      if (!this.token) return null;
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) throw new Error('Token expired');
      const user = await res.json();
      this.user = user;
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      this.renderNavbarAuthUI();
      return user;
    }

    async register(username, password, displayName) {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, display_name: displayName })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Đăng ký thất bại');
      }
      this.setSession(data.token, data.user);
      await this.syncLocalHistoryToServer();
      return data;
    }

    async login(username, password) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Đăng nhập thất bại');
      }
      this.setSession(data.token, data.user);
      await this.syncLocalHistoryToServer();
      return data;
    }

    setSession(token, user) {
      this.token = token;
      this.user = user;
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      this.renderNavbarAuthUI();
      this.closeModal();
      window.dispatchEvent(new CustomEvent('audioweb:auth-changed', { detail: { isLoggedIn: true, user } }));
    }

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
      this.renderNavbarAuthUI();
      window.dispatchEvent(new CustomEvent('audioweb:auth-changed', { detail: { isLoggedIn: false } }));
    }

    async syncLocalHistoryToServer() {
      if (!this.isLoggedIn()) return;
      try {
        const raw = localStorage.getItem(this.LOCAL_HISTORY_KEY);
        if (!raw) return;
        const localList = JSON.parse(raw);
        if (!Array.isArray(localList) || localList.length === 0) return;

        const items = localList.map(item => ({
          book_slug: item.bookSlug || item.slug || '',
          book_title: item.bookTitle || item.title || '',
          book_author: item.bookAuthor || item.author || '',
          book_cover: item.bookCover || item.cover || '',
          chapter_id: item.chapterId || '',
          chapter_title: item.chapterTitle || '',
          current_time: Number(item.currentTime || item.time || 0),
          duration: Number(item.duration || 0),
          progress: Number(item.progress || 0)
        })).filter(i => i.book_slug && i.chapter_id);

        if (items.length > 0) {
          await fetch('/api/user/history/sync-bulk', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ items })
          });
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ lịch sử offline:', err);
      }
    }

    async saveProgress(item) {
      // Always update localStorage for offline cache
      try {
        let history = JSON.parse(localStorage.getItem(this.LOCAL_HISTORY_KEY) || '[]');
        history = history.filter(h => (h.bookSlug || h.slug) !== item.book_slug);
        history.unshift({
          bookSlug: item.book_slug,
          slug: item.book_slug,
          bookTitle: item.book_title,
          title: item.book_title,
          bookAuthor: item.book_author,
          bookCover: item.book_cover,
          chapterId: item.chapter_id,
          chapterTitle: item.chapter_title,
          currentTime: item.current_time,
          duration: item.duration,
          progress: item.progress,
          updatedAt: new Date().toISOString()
        });
        localStorage.setItem(this.LOCAL_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
      } catch (e) {}

      // If logged in, send to backend
      if (this.isLoggedIn()) {
        try {
          await fetch('/api/user/history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify(item)
          });
        } catch (e) {
          console.warn('Không thể lưu tiến trình lên máy chủ:', e);
        }
      }
    }

    openModal(mode = 'login') {
      const modal = document.getElementById('auth-modal');
      if (!modal) return;
      this.switchTab(mode);
      modal.classList.add('active');
      document.body.classList.add('modal-open');
    }

    closeModal() {
      const modal = document.getElementById('auth-modal');
      if (!modal) return;
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
      const errEl = document.getElementById('auth-error-msg');
      if (errEl) errEl.textContent = '';
    }

    switchTab(mode) {
      const loginTab = document.getElementById('auth-tab-login');
      const regTab = document.getElementById('auth-tab-register');
      const loginForm = document.getElementById('auth-form-login');
      const regForm = document.getElementById('auth-form-register');
      const errEl = document.getElementById('auth-error-msg');
      if (errEl) errEl.textContent = '';

      if (mode === 'register') {
        regTab?.classList.add('active');
        loginTab?.classList.remove('active');
        regForm?.classList.add('active');
        loginForm?.classList.remove('active');
      } else {
        loginTab?.classList.add('active');
        regTab?.classList.remove('active');
        loginForm?.classList.add('active');
        regForm?.classList.remove('active');
      }
    }

    setupModalListeners() {
      document.querySelectorAll('.open-auth-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal(btn.dataset.authMode || 'login');
        });
      });

      document.getElementById('auth-modal-close')?.addEventListener('click', () => this.closeModal());
      document.getElementById('auth-modal-overlay')?.addEventListener('click', () => this.closeModal());

      document.getElementById('auth-tab-login')?.addEventListener('click', () => this.switchTab('login'));
      document.getElementById('auth-tab-register')?.addEventListener('click', () => this.switchTab('register'));

      // Form login submit
      document.getElementById('auth-form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('auth-error-msg');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        errEl.textContent = '';
        const username = document.getElementById('auth-login-username').value.trim();
        const password = document.getElementById('auth-login-password').value;
        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Đang đăng nhập...';
          await this.login(username, password);
        } catch (err) {
          errEl.textContent = err.message;
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Đăng nhập';
        }
      });

      // Form register submit
      document.getElementById('auth-form-register')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('auth-error-msg');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        errEl.textContent = '';
        const username = document.getElementById('auth-reg-username').value.trim();
        const displayName = document.getElementById('auth-reg-displayname').value.trim();
        const password = document.getElementById('auth-reg-password').value;
        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Đang tạo tài khoản...';
          await this.register(username, password, displayName);
        } catch (err) {
          errEl.textContent = err.message;
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Đăng ký';
        }
      });

      // Close on Escape
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeModal();
      });
    }

    renderNavbarAuthUI() {
      const container = document.getElementById('navbar-auth-container');
      if (!container) return;

      if (this.isLoggedIn()) {
        const initial = (this.user.display_name || this.user.username || 'U').charAt(0).toUpperCase();
        const color = this.user.avatar_color || '#6366f1';
        container.innerHTML = `
          <div class="user-profile-menu relative">
            <button id="user-menu-btn" class="flex items-center gap-2 p-1.5 rounded-full hover:bg-surface-elevated transition focus:outline-none" aria-label="Tài khoản">
              <span class="user-avatar-circle flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm shadow" style="background-color: ${color};">
                ${initial}
              </span>
              <span class="hidden md:inline text-sm font-medium text-primary max-w-[120px] truncate">
                ${this.user.display_name}
              </span>
              <svg class="w-4 h-4 text-secondary hidden md:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="user-dropdown-menu" class="user-dropdown hidden absolute right-0 mt-2 w-56 rounded-2xl shadow-xl py-2 z-50 border border-[var(--border)] bg-[var(--bg-surface)] backdrop-blur-xl">
              <div class="px-4 py-2 border-b border-[var(--border)]">
                <p class="text-sm font-semibold text-primary truncate">${this.user.display_name}</p>
                <p class="text-xs text-secondary truncate">@${this.user.username}</p>
              </div>
              <button id="auth-logout-btn" class="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                Đăng xuất
              </button>
            </div>
          </div>
        `;

        const menuBtn = container.querySelector('#user-menu-btn');
        const dropdown = container.querySelector('#user-dropdown-menu');
        menuBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown?.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
          if (!container.contains(e.target)) dropdown?.classList.add('hidden');
        });
        container.querySelector('#auth-logout-btn')?.addEventListener('click', () => {
          this.logout();
        });
      } else {
        container.innerHTML = `
          <button class="open-auth-modal flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition shadow-sm" data-auth-mode="login">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span>Đăng nhập</span>
          </button>
        `;
        container.querySelector('.open-auth-modal')?.addEventListener('click', () => this.openModal('login'));
      }
    }
  }

  window.authManager = new AuthManager();
})();
```

---

### Task 6: Frontend Auth UI Integration & Styling

**Files:**
- Create: `frontend/css/auth.css`
- Modify: `frontend/index.html`
- Modify: `frontend/reader.html`
- Test: Verify DOM rendering and modal open/close in browser

**Interfaces:**
- Consumes: `frontend/js/auth.js`
- Produces:
  - Auth modal overlay and cards (`#auth-modal`)
  - Navbar auth containers (`#navbar-auth-container`)
  - Styling strictly bound to CSS variables

- [ ] **Step 1: Write `frontend/css/auth.css`**

Create `frontend/css/auth.css` with clean animations, backdrop-blur, and theme-variable colors:
```css
/* Auth Modal Styling */
.auth-modal-wrapper {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease;
}

.auth-modal-wrapper.active {
  opacity: 1;
  visibility: visible;
}

.auth-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

.auth-modal-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  padding: 1.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  transform: scale(0.95) translateY(10px);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-primary);
  z-index: 10;
}

.auth-modal-wrapper.active .auth-modal-card {
  transform: scale(1) translateY(0);
}

.auth-tabs {
  display: flex;
  background: var(--bg-primary);
  border-radius: 0.75rem;
  padding: 0.25rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
}

.auth-tab-btn {
  flex: 1;
  padding: 0.6rem;
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 0.5rem;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.auth-tab-btn.active {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.auth-form {
  display: none;
  flex-direction: column;
  gap: 1rem;
}

.auth-form.active {
  display: flex;
}

.auth-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.auth-input-group label {
  font-size: 0.825rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.auth-input {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 0.65rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.auth-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.auth-submit-btn {
  margin-top: 0.5rem;
  width: 100%;
  padding: 0.8rem;
  border-radius: 0.65rem;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
  transition: opacity 0.2s, transform 0.1s;
}

.auth-submit-btn:hover {
  opacity: 0.92;
}

.auth-submit-btn:active {
  transform: scale(0.98);
}

.auth-error {
  color: #ef4444;
  font-size: 0.85rem;
  min-height: 1.25rem;
  text-align: center;
}
```

- [ ] **Step 2: Add Auth markup and script to `frontend/index.html`**

In `<head>`:
```html
<link rel="stylesheet" href="/css/auth.css">
```
In navbar (next to theme toggle and search):
```html
<div id="navbar-auth-container"></div>
```
Before `</body>`:
```html
<!-- Auth Modal -->
<div id="auth-modal" class="auth-modal-wrapper" role="dialog" aria-modal="true">
  <div id="auth-modal-overlay" class="auth-modal-overlay"></div>
  <div class="auth-modal-card">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xl font-bold text-primary">Tài khoản AudioWeb</h3>
      <button id="auth-modal-close" class="p-1 rounded-full text-secondary hover:text-primary transition" aria-label="Đóng">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
    <div class="auth-tabs">
      <button id="auth-tab-login" class="auth-tab-btn active">Đăng nhập</button>
      <button id="auth-tab-register" class="auth-tab-btn">Đăng ký</button>
    </div>
    <div id="auth-error-msg" class="auth-error"></div>
    <form id="auth-form-login" class="auth-form active">
      <div class="auth-input-group">
        <label for="auth-login-username">Tên đăng nhập</label>
        <input id="auth-login-username" class="auth-input" type="text" placeholder="Nhập tên đăng nhập" required autocomplete="username">
      </div>
      <div class="auth-input-group">
        <label for="auth-login-password">Mật khẩu</label>
        <input id="auth-login-password" class="auth-input" type="password" placeholder="Nhập mật khẩu" required autocomplete="current-password">
      </div>
      <button type="submit" class="auth-submit-btn">Đăng nhập</button>
    </form>
    <form id="auth-form-register" class="auth-form">
      <div class="auth-input-group">
        <label for="auth-reg-username">Tên đăng nhập (chữ cái, số, _)</label>
        <input id="auth-reg-username" class="auth-input" type="text" placeholder="user123" required autocomplete="username">
      </div>
      <div class="auth-input-group">
        <label for="auth-reg-displayname">Tên hiển thị</label>
        <input id="auth-reg-displayname" class="auth-input" type="text" placeholder="Nguyễn Văn A" required>
      </div>
      <div class="auth-input-group">
        <label for="auth-reg-password">Mật khẩu (tối thiểu 6 ký tự)</label>
        <input id="auth-reg-password" class="auth-input" type="password" placeholder="••••••••" required minlength="6" autocomplete="new-password">
      </div>
      <button type="submit" class="auth-submit-btn">Đăng ký tài khoản</button>
    </form>
  </div>
</div>
<script src="/js/auth.js"></script>
```

- [ ] **Step 3: Add Auth markup and script to `frontend/reader.html`**

Add `<link rel="stylesheet" href="/css/auth.css">`, `#navbar-auth-container`, modal HTML, and `<script src="/js/auth.js"></script>`.

---

### Task 7: History Synchronization Integration

**Files:**
- Modify: `frontend/js/home.js`
- Modify: `frontend/js/reader.js`
- Test: Verify progress is synced when reading/listening

**Interfaces:**
- Consumes: `window.authManager.saveProgress()`, `window.authManager.isLoggedIn()`
- Produces: Real-time progress updates sent to server and synced back when opening reader

- [ ] **Step 1: Hook reader playback/reading updates to `window.authManager.saveProgress()`**

In `frontend/js/reader.js`, update the history saving callback to call `window.authManager.saveProgress()`:
```javascript
function saveReadingHistory(slug, bookMeta, chapterId, chapterTitle, currentTime, duration, progress) {
  const item = {
    book_slug: slug,
    book_title: bookMeta?.title || slug,
    book_author: bookMeta?.author || '',
    book_cover: bookMeta?.cover || '',
    chapter_id: chapterId,
    chapter_title: chapterTitle,
    current_time: currentTime,
    duration: duration,
    progress: progress
  };
  if (window.authManager) {
    window.authManager.saveProgress(item);
  }
}
```

- [ ] **Step 2: Update homepage "Tiếp tục nghe / đọc" section to load from backend when logged in**

In `frontend/js/home.js`, if `window.authManager?.isLoggedIn()`, fetch latest history from `GET /api/user/history` and render the continue-listening cards.

- [ ] **Step 3: Listen to `audioweb:auth-changed` in `home.js` to re-render history section immediately**

```javascript
window.addEventListener('audioweb:auth-changed', () => {
  renderRecentHistory();
});
```

---

### Task 8: End-to-End System Verification

**Files:**
- Test scripts: PowerShell / API verification calls
- Manual Verification: Browser inspection

- [ ] **Step 1: Verify API registration with duplicate check**
- [ ] **Step 2: Verify API login with incorrect password rejection**
- [ ] **Step 3: Verify authenticated history save and retrieval**
- [ ] **Step 4: Verify bulk history sync**
- [ ] **Step 5: Verify theme styling of modal in light and dark modes**
