# Authentication and Personalization Design Specification

**Date:** 2026-09-30  
**Status:** Approved  
**Author:** Antigravity & User  

---

## 1. Overview & Goals
The goal of this feature is to introduce user authentication (Registration, Login, Session Management) and personal progress synchronization for **Audio_Web**.
Users can create an account, log in across devices/browsers, and keep their audio listening and reading progress (current book, chapter, playback position in seconds, reading progress) synchronized in real-time.

Guests can continue using the application without disruption, storing their progress in `localStorage`. Upon logging in, existing local history will be automatically merged into their account.

---

## 2. Architecture & Tech Stack

### 2.1 Backend
- **Framework:** FastAPI (`backend/main.py`)
- **Database:** SQLite (`backend/data/audioweb.db`) via Python's built-in `sqlite3` module (connection pooling & row factory).
- **Password Security:** Salted PBKDF2 with SHA-256 (`hashlib.pbkdf2_hmac`, 100,000 iterations), using `secrets.token_hex(16)` as salt. Format stored: `<salt>$<hash>`.
- **Session / Token:** JSON Web Token (JWT) signed with HMAC-SHA256 (`pyjwt` or lightweight stdlib HMAC-SHA256 implementation) stored in client `localStorage['audioweb-token']`. Token expiration: 30 days.

### 2.2 Frontend
- **Auth Module:** `frontend/js/auth.js` manages login state, token persistence, user profile, auth modal UI, and history sync hooks.
- **UI Components:**
  - **Auth Modal:** Embedded in `frontend/index.html` and `frontend/reader.html` with tabs for "Đăng nhập" (Login) and "Đăng ký" (Register).
  - **Navbar User Button / Menu:**
    - Guest state: "Đăng nhập" button (accent outline / pill).
    - Logged-in state: User avatar (initial letter with unique background color) + display name dropdown with "Thông tin cá nhân", "Lịch sử nghe/đọc", "Đăng xuất".
- **History Sync Engine:**
  - When logged in, `home.js` and `reader.js` automatically save playback & reading progress to `POST /api/user/history` (debounced).
  - If offline or network fails, gracefully fall back to `localStorage['audioweb-recent-history']`.
  - On login, auto-send existing `localStorage` history to `POST /api/user/history/sync-bulk` to merge seamlessly.

---

## 3. Database Schema

Database path: `backend/data/audioweb.db` (auto-created on startup).

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX IF NOT EXISTS idx_history_user_updated ON user_history(user_id, updated_at DESC);
```

---

## 4. API Specification

### 4.1 Authentication Endpoints

#### `POST /api/auth/register`
- **Request Body (JSON):**
  ```json
  {
    "username": "user123",
    "password": "Password123",
    "display_name": "Người Đọc Sách"
  }
  ```
- **Validation:**
  - `username`: 3-30 characters, alphanumeric and underscores only.
  - `password`: minimum 6 characters.
  - `display_name`: 1-50 characters.
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "username": "user123",
      "display_name": "Người Đọc Sách",
      "avatar_color": "#6366f1"
    }
  }
  ```
- **Errors:** 400 (Validation failed or username already exists).

#### `POST /api/auth/login`
- **Request Body (JSON):**
  ```json
  {
    "username": "user123",
    "password": "Password123"
  }
  ```
- **Response (200 OK):** Same as register.
- **Errors:** 401 (Invalid username or password).

#### `GET /api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "id": 1,
    "username": "user123",
    "display_name": "Người Đọc Sách",
    "avatar_color": "#6366f1"
  }
  ```
- **Errors:** 401 (Invalid / expired token).

---

### 4.2 History & Personalization Endpoints

#### `GET /api/user/history`
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:** `limit=20` (default 20, max 100)
- **Response (200 OK):**
  ```json
  [
    {
      "book_slug": "tien-nghich",
      "book_title": "Tiên Nghịch",
      "book_author": "Nhĩ Căn",
      "book_cover": "/covers/tien-nghich.jpg",
      "chapter_id": "chuong-10",
      "chapter_title": "Chương 10: Nhập Môn",
      "current_time": 320.5,
      "duration": 1420.0,
      "progress": 22.5,
      "updated_at": "2026-09-30 08:30:00"
    }
  ]
  ```

#### `POST /api/user/history`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body (JSON):**
  ```json
  {
    "book_slug": "tien-nghich",
    "book_title": "Tiên Nghịch",
    "book_author": "Nhĩ Căn",
    "book_cover": "/covers/tien-nghich.jpg",
    "chapter_id": "chuong-10",
    "chapter_title": "Chương 10: Nhập Môn",
    "current_time": 320.5,
    "duration": 1420.0,
    "progress": 22.5
  }
  ```
- **Behavior:** Upserts record in `user_history` for `(user_id, book_slug)` and updates `updated_at`.
- **Response (200 OK):** `{"status": "ok"}`

#### `POST /api/user/history/sync-bulk`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body (JSON):**
  ```json
  {
    "items": [
      {
        "book_slug": "tien-nghich",
        "book_title": "Tiên Nghịch",
        "book_author": "Nhĩ Căn",
        "book_cover": "/covers/tien-nghich.jpg",
        "chapter_id": "chuong-10",
        "chapter_title": "Chương 10: Nhập Môn",
        "current_time": 320.5,
        "duration": 1420.0,
        "progress": 22.5,
        "updated_at": "2026-09-30 08:30:00"
      }
    ]
  }
  ```
- **Behavior:** Merges offline items keeping the most recently updated entry per `book_slug`.
- **Response (200 OK):** `{"synced_count": 1}`

---

## 5. UI / UX Design & Interactions

### 5.1 Auth Modal
- Smooth modal overlay adhering to the active theme CSS variables (`var(--bg-surface)`, `var(--text-primary)`, `var(--border)`, `var(--accent)`).
- Tabs: "Đăng nhập" and "Đăng ký" with animated tab indicator.
- Inputs with icons (username, password, display name). Show/hide password toggle.
- Error alerts with clean inline styling.
- Closes on Escape, click outside, or close `(X)` button.

### 5.2 Navbar Integration
- If logged out: "Đăng nhập" button opens Auth Modal.
- If logged in:
  - Displays circular avatar with first letter of `display_name` and assigned `avatar_color`.
  - Dropdown menu upon clicking avatar with:
    - User name & username
    - Lịch sử đã nghe / đã đọc
    - Đăng xuất (clears token, resets UI to guest state, keeps local history intact)

### 5.3 Reader Integration
- History automatically saves to backend if logged in (`POST /api/user/history`), throttled to once every 5 seconds or upon chapter switch / pause.
- When opening reader for a book, if logged in, fetches user's latest progress if newer than local progress.

---

## 6. Security Considerations
- Password storage using standard PBKDF2 with SHA-256 and unique 16-byte random salt.
- JWT tokens signed with secret key (`SECRET_KEY` in environment or fallback secure random secret generated on first start).
- CORS headers maintained properly in FastAPI.
- SQL injection prevented using parameterized SQLite queries (`?` placeholders).
- Token verification via standard HTTP `Authorization: Bearer <token>`.
