import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, Optional
from fastapi import HTTPException, Header

try:
    from database import get_db
except ImportError:
    from backend.database import get_db

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
