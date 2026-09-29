import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

try:
    from apps.web_reader.backend.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("kosync")


def get_book_chapters(book_dir: Path, meta_chapters: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    if meta_chapters:
        return sorted(meta_chapters, key=lambda c: c.get("chapter_index", 0))

    chapter_map: Dict[str, Dict[str, Any]] = {}
    if not book_dir.exists():
        return []

    for file in book_dir.iterdir():
        if file.is_file():
            match = re.match(r"^(chapter[_\-]?\d+)", file.stem, re.IGNORECASE)
            if match:
                ch_id = match.group(1)
                num_match = re.search(r"\d+", ch_id)
                num = int(num_match.group(0)) if num_match else 0
                if ch_id not in chapter_map:
                    chapter_map[ch_id] = {
                        "id": ch_id,
                        "title": f"Chương {num}",
                        "chapter_index": num,
                    }

    return sorted(chapter_map.values(), key=lambda c: c.get("chapter_index", 0))


def get_document_hash(book_dir: Path, slug: str, meta: Optional[Dict[str, Any]] = None) -> str:
    """
    Returns MD5 hash for the book:
    1. Uses `document_hash` or `md5` from metadata.json.
    2. Else computes MD5 of the book's .epub file in book_dir.
    3. Else falls back to MD5 of the slug.
    """
    if meta is None and book_dir.exists():
        meta_file = book_dir / "metadata.json"
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                meta = {}

    if meta:
        for key in ("document_hash", "md5", "hash"):
            val = meta.get(key)
            if val and isinstance(val, str) and val.strip():
                return val.strip()

    if book_dir.exists():
        for f in sorted(book_dir.iterdir(), key=lambda p: p.name):
            if f.is_file() and f.suffix.lower() == ".epub":
                try:
                    return hashlib.md5(f.read_bytes()).hexdigest()
                except Exception:
                    pass

    return hashlib.md5(slug.encode("utf-8")).hexdigest()


_CUE_MAP_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}


def _build_cue_map(book_dir: Path) -> List[Dict[str, Any]]:
    slug = book_dir.name
    meta_file = book_dir / "metadata.json"
    mtime = meta_file.stat().st_mtime if meta_file.exists() else 0.0

    cached = _CUE_MAP_CACHE.get(slug)
    if cached and cached[0] == mtime:
        return cached[1]

    meta: Dict[str, Any] = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    chapters = get_book_chapters(book_dir, meta.get("chapters"))
    items: List[Dict[str, Any]] = []
    current_cum = 0

    for ch in chapters:
        ch_id = ch.get("id")
        if not ch_id:
            continue

        cues_file = None
        for name in [f"{ch_id}_cues.json", f"{ch_id}.cues.json", f"{ch_id}.json"]:
            cand = book_dir / name
            if cand.exists() and cand.is_file():
                cues_file = cand
                break

        cues = []
        if cues_file:
            try:
                with open(cues_file, "r", encoding="utf-8") as f:
                    cues = json.load(f)
            except Exception:
                cues = []

        if cues and isinstance(cues, list):
            for cue in cues:
                cid = cue.get("id")
                text = cue.get("text", "")
                words = len(text.split()) if text else 0
                weight = max(1, words)
                items.append({
                    "chapter_id": ch_id,
                    "cue_id": cid,
                    "weight": weight,
                    "cum_start": current_cum,
                    "cum_end": current_cum + weight,
                })
                current_cum += weight
        else:
            weight = 100
            items.append({
                "chapter_id": ch_id,
                "cue_id": None,
                "weight": weight,
                "cum_start": current_cum,
                "cum_end": current_cum + weight,
            })
            current_cum += weight

    _CUE_MAP_CACHE[slug] = (mtime, items)
    return items


def location_to_progress(book_dir: Path, chapter_id: str, cue_id: Optional[str] = None) -> float:
    """
    Calculates overall book progress (0.0 to 1.0) given chapter_id and optional cue_id.
    """
    items = _build_cue_map(book_dir)
    if not items:
        return 0.0

    total_weight = items[-1]["cum_end"]
    if total_weight <= 0:
        return 0.0

    target_item = None
    if cue_id:
        for it in items:
            if it["chapter_id"] == chapter_id and it["cue_id"] == cue_id:
                target_item = it
                break

    if not target_item:
        for it in items:
            if it["chapter_id"] == chapter_id:
                target_item = it
                break

    if not target_item:
        return 0.0

    pct = target_item["cum_start"] / total_weight
    return round(float(pct), 4)


def progress_to_location(book_dir: Path, percentage: float) -> Tuple[Optional[str], Optional[str]]:
    """
    Maps an overall book progress percentage (0.0 to 1.0) back to (chapter_id, cue_id).
    """
    items = _build_cue_map(book_dir)
    if not items:
        return (None, None)

    total_weight = items[-1]["cum_end"]
    pct = max(0.0, min(1.0, float(percentage)))
    target_weight = pct * total_weight

    for it in items:
        if it["cum_start"] <= target_weight < it["cum_end"]:
            return (it["chapter_id"], it["cue_id"])

    last = items[-1]
    return (last["chapter_id"], last["cue_id"])


class KosyncClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        user_key: Optional[str] = None,
    ):
        self.base_url = (base_url or settings.KOSYNC_URL).rstrip("/")
        self.username = username if username is not None else settings.KOSYNC_USER
        self.key = password if password is not None else (user_key if user_key is not None else settings.KOSYNC_KEY)

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "x-auth-user": self.username,
            "x-auth-key": self.key,
            "Content-Type": "application/json",
        }

    async def push_progress(
        self,
        document_hash: str,
        progress: str,
        percentage: float,
        device: str = "WebReader",
        device_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        url = f"{self.base_url}/syncs/progress"
        payload: Dict[str, Any] = {
            "document": document_hash,
            "progress": str(progress),
            "percentage": float(percentage),
            "device": device,
            "device_id": device_id or device,
        }
        if metadata:
            payload["metadata"] = metadata

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.put(url, headers=self.headers, json=payload, timeout=10.0)
                status = getattr(resp, "status_code", 500)
                return 200 <= status < 300
        except Exception as e:
            logger.error(f"Error pushing progress to Kosync: {e}")
            return False

    async def get_progress(self, document_hash: str) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}/syncs/progress/{document_hash}"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=self.headers, timeout=10.0)
                if getattr(resp, "status_code", None) == 200:
                    data = resp.json()
                    if isinstance(data, dict):
                        return data
                return None
        except Exception as e:
            logger.error(f"Error fetching progress from Kosync: {e}")
            return None
