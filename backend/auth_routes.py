import random
import re
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

try:
    from auth import (
        AVATAR_COLORS,
        create_access_token,
        get_current_user,
        hash_password,
        verify_password,
    )
    from database import get_db
except ImportError:
    from backend.auth import (
        AVATAR_COLORS,
        create_access_token,
        get_current_user,
        hash_password,
        verify_password,
    )
    from backend.database import get_db

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
    if not display_name:
        display_name = username

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


class UpdatePreferencesRequest(BaseModel):
    preferences: Dict[str, Any]


@router.get("/preferences")
def get_user_preferences(user: Dict[str, Any] = Depends(get_current_user)):
    import json
    with get_db() as conn:
        row = conn.execute("SELECT preferences_json FROM user_preferences WHERE user_id = ?", (user["id"],)).fetchone()
        if not row:
            return {}
        try:
            return json.loads(row["preferences_json"])
        except Exception:
            return {}


@router.post("/preferences")
def save_user_preferences(req: UpdatePreferencesRequest, user: Dict[str, Any] = Depends(get_current_user)):
    import json
    pref_str = json.dumps(req.preferences, ensure_ascii=False)
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, preferences_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                preferences_json = excluded.preferences_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user["id"], pref_str)
        )
        conn.commit()
    return {"status": "ok", "preferences": req.preferences}

