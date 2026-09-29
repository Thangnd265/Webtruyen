import hashlib
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from apps.web_reader.backend.kosync import (
    KosyncClient,
    get_document_hash,
    location_to_progress,
    progress_to_location,
)
from apps.web_reader.backend.main import app

test_client = TestClient(app)


@patch("httpx.AsyncClient.put")
@pytest.mark.asyncio
async def test_push_progress(mock_put):
    mock_put.return_value = MagicMock(status_code=200, json=lambda: {"status": "success"})

    client = KosyncClient(base_url="http://192.168.1.103:8085", username="Gudian", password="testpassword")
    success = await client.push_progress(
        document_hash="d41d8cd98f00b204e9800998ecf8427e",
        progress="chapter_002#cue-5",
        percentage=0.254,
        device="WebReader",
    )
    assert success is True
    assert mock_put.called
    call_args = mock_put.call_args
    assert "http://192.168.1.103:8085/syncs/progress" in call_args[0][0]
    assert call_args[1]["headers"]["x-auth-user"] == "Gudian"
    assert call_args[1]["headers"]["x-auth-key"] == "testpassword"
    payload = call_args[1]["json"]
    assert payload["document"] == "d41d8cd98f00b204e9800998ecf8427e"
    assert payload["progress"] == "chapter_002#cue-5"
    assert payload["percentage"] == 0.254
    assert payload["device"] == "WebReader"


@patch("httpx.AsyncClient.get")
@pytest.mark.asyncio
async def test_get_progress_success(mock_get):
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "document": "d41d8cd98f00b204e9800998ecf8427e",
            "progress": "chapter_002#cue-5",
            "percentage": 0.254,
            "device": "Kindle",
            "timestamp": 1727500000,
        },
    )
    client = KosyncClient(base_url="http://192.168.1.103:8085", username="Gudian", password="testpassword")
    data = await client.get_progress("d41d8cd98f00b204e9800998ecf8427e")
    assert data is not None
    assert data["percentage"] == 0.254
    assert data["progress"] == "chapter_002#cue-5"
    assert data["device"] == "Kindle"
    assert mock_get.called
    assert "http://192.168.1.103:8085/syncs/progress/d41d8cd98f00b204e9800998ecf8427e" in mock_get.call_args[0][0]


@patch("httpx.AsyncClient.get")
@pytest.mark.asyncio
async def test_get_progress_not_found(mock_get):
    mock_get.return_value = MagicMock(status_code=404)
    client = KosyncClient()
    data = await client.get_progress("nonexistent_hash")
    assert data is None


def test_document_hash_calculation(tmp_path):
    # Case 1: metadata.json with document_hash
    b1 = tmp_path / "book1"
    b1.mkdir()
    (b1 / "metadata.json").write_text(json.dumps({"document_hash": "hash123"}), encoding="utf-8")
    assert get_document_hash(b1, "book1") == "hash123"

    # Case 2: metadata.json with md5
    b2 = tmp_path / "book2"
    b2.mkdir()
    (b2 / "metadata.json").write_text(json.dumps({"md5": "md5abc"}), encoding="utf-8")
    assert get_document_hash(b2, "book2") == "md5abc"

    # Case 3: epub file in directory
    b3 = tmp_path / "book3"
    b3.mkdir()
    epub_content = b"sample-epub-binary-data"
    (b3 / "test.epub").write_bytes(epub_content)
    expected_epub_hash = hashlib.md5(epub_content).hexdigest()
    assert get_document_hash(b3, "book3") == expected_epub_hash

    # Case 4: fallback to slug hash
    b4 = tmp_path / "book4"
    b4.mkdir()
    expected_slug_hash = hashlib.md5(b"book4").hexdigest()
    assert get_document_hash(b4, "book4") == expected_slug_hash


def test_location_to_progress_and_progress_to_location(tmp_path):
    book_dir = tmp_path / "test-story"
    book_dir.mkdir()

    # Chapter 1: 2 cues, 50 words each
    cues_ch1 = [
        {"id": "cue-1", "start": 0.0, "end": 5.0, "text": " " .join(["word"] * 50)},
        {"id": "cue-2", "start": 5.0, "end": 10.0, "text": " " .join(["word"] * 50)},
    ]
    (book_dir / "chapter_001_cues.json").write_text(json.dumps(cues_ch1), encoding="utf-8")

    # Chapter 2: 2 cues, 50 words each
    cues_ch2 = [
        {"id": "cue-1", "start": 0.0, "end": 5.0, "text": " " .join(["word"] * 50)},
        {"id": "cue-2", "start": 5.0, "end": 10.0, "text": " " .join(["word"] * 50)},
    ]
    (book_dir / "chapter_002_cues.json").write_text(json.dumps(cues_ch2), encoding="utf-8")

    # Metadata defining order
    meta = {
        "chapters": [
            {"id": "chapter_001", "chapter_index": 1},
            {"id": "chapter_002", "chapter_index": 2},
        ]
    }
    (book_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")

    # Total words: 200
    # Ch1 cue-1: 0..50 -> 0.0%
    # Ch1 cue-2: 50..100 -> 25.0%
    # Ch2 cue-1: 100..150 -> 50.0%
    # Ch2 cue-2: 150..200 -> 75.0%
    p_ch1_1 = location_to_progress(book_dir, "chapter_001", "cue-1")
    assert pytest.approx(p_ch1_1, 0.01) == 0.0

    p_ch2_1 = location_to_progress(book_dir, "chapter_002", "cue-1")
    assert pytest.approx(p_ch2_1, 0.01) == 0.5

    # Reverse lookup
    ch, cue = progress_to_location(book_dir, 0.52)
    assert ch == "chapter_002"
    assert cue == "cue-1"

    ch, cue = progress_to_location(book_dir, 0.80)
    assert ch == "chapter_002"
    assert cue == "cue-2"


@patch("apps.web_reader.backend.main.kosync_client.get_progress")
def test_api_get_sync(mock_get_progress, tmp_path):
    book_dir = tmp_path / "sync-book"
    book_dir.mkdir()
    meta = {
        "title": "Sync Book",
        "document_hash": "sync123",
        "chapters": [{"id": "chapter_001", "chapter_index": 1}],
    }
    (book_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    (book_dir / "chapter_001_cues.json").write_text(
        json.dumps([{"id": "cue-1", "start": 0.0, "end": 2.0, "text": "hello"}]), encoding="utf-8"
    )

    # Mock Kosync returning sync data
    mock_get_progress.return_value = {
        "document": "sync123",
        "progress": "chapter_001#cue-1",
        "percentage": 0.35,
        "device": "Kindle",
        "timestamp": 1727500000,
    }

    res = test_client.get("/api/books/sync-book/sync")
    assert res.status_code == 200
    data = res.json()
    assert data["percentage"] == 0.35
    assert data["chapter_id"] == "chapter_001"
    assert data["cue_id"] == "cue-1"
    assert data["timestamp"] == 1727500000
    assert mock_get_progress.called


@patch("apps.web_reader.backend.main.kosync_client.push_progress")
def test_api_post_sync(mock_push_progress, tmp_path):
    book_dir = tmp_path / "sync-book"
    book_dir.mkdir()
    meta = {
        "title": "Sync Book",
        "document_hash": "sync123",
        "chapters": [{"id": "chapter_001", "chapter_index": 1}],
    }
    (book_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    (book_dir / "chapter_001_cues.json").write_text(
        json.dumps([{"id": "cue-1", "start": 0.0, "end": 2.0, "text": "hello"}]), encoding="utf-8"
    )

    mock_push_progress.return_value = True

    payload = {
        "chapter_id": "chapter_001",
        "cue_id": "cue-1",
        "percentage": 0.15,
        "device": "WebReader",
    }
    res = test_client.post("/api/books/sync-book/sync", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["document"] == "sync123"
    assert data["percentage"] == 0.15
    assert mock_push_progress.called


@patch("apps.web_reader.backend.main.kosync_client.get_progress")
def test_api_get_sync_no_prior_progress(mock_get_progress, tmp_path):
    book_dir = tmp_path / "sync-book"
    book_dir.mkdir()
    mock_get_progress.return_value = None

    res = test_client.get("/api/books/sync-book/sync")
    assert res.status_code == 200
    data = res.json()
    assert data["percentage"] == 0.0
    assert data["chapter_id"] is None
    assert data["cue_id"] is None
    assert data["timestamp"] is None


@patch("apps.web_reader.backend.main.kosync_client.get_progress")
def test_api_get_sync_koreader_xpath(mock_get_progress, tmp_path):
    book_dir = tmp_path / "sync-book"
    book_dir.mkdir()
    meta = {
        "title": "Sync Book",
        "document_hash": "sync123",
        "chapters": [
            {"id": "chapter_001", "chapter_index": 1},
            {"id": "chapter_002", "chapter_index": 2},
        ],
    }
    (book_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    (book_dir / "chapter_001_cues.json").write_text(
        json.dumps([{"id": "cue-1", "start": 0.0, "end": 2.0, "text": " " .join(["word"] * 100)}]), encoding="utf-8"
    )
    (book_dir / "chapter_002_cues.json").write_text(
        json.dumps([{"id": "cue-2", "start": 0.0, "end": 2.0, "text": " " .join(["word"] * 100)}]), encoding="utf-8"
    )

    # Kindle sends xpath as progress, and percentage=0.75
    mock_get_progress.return_value = {
        "document": "sync123",
        "progress": "/body/DocFragment[2]/div/p[4]",
        "percentage": 0.75,
        "device": "Kindle",
        "timestamp": 1727500000,
    }

    res = test_client.get("/api/books/sync-book/sync")
    assert res.status_code == 200
    data = res.json()
    assert data["percentage"] == 0.75
    assert data["chapter_id"] == "chapter_002"
    assert data["cue_id"] == "cue-2"


@patch("apps.web_reader.backend.main.kosync_client.push_progress")
def test_api_post_sync_calculate_percentage(mock_push_progress, tmp_path):
    book_dir = tmp_path / "sync-book"
    book_dir.mkdir()
    meta = {
        "title": "Sync Book",
        "author": "Nguyen Du",
        "chapters": [
            {"id": "chapter_001", "chapter_index": 1},
            {"id": "chapter_002", "chapter_index": 2},
        ],
    }
    (book_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    (book_dir / "chapter_001_cues.json").write_text(
        json.dumps([{"id": "cue-1", "text": "word " * 100}]), encoding="utf-8"
    )
    (book_dir / "chapter_002_cues.json").write_text(
        json.dumps([{"id": "cue-1", "text": "word " * 100}]), encoding="utf-8"
    )

    mock_push_progress.return_value = True

    # No percentage in payload -> should calculate automatically
    payload = {
        "chapter_id": "chapter_002",
        "cue_id": "cue-1",
        "device": "WebReader",
    }
    res = test_client.post("/api/books/sync-book/sync", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert pytest.approx(data["percentage"], 0.01) == 0.5
    assert mock_push_progress.called
    call_args = mock_push_progress.call_args[1]
    assert call_args["metadata"]["authors"] == "Nguyen Du"


@patch("apps.web_reader.backend.main.kosync_client.push_progress")
def test_api_post_sync_failure_returns_502(mock_push_progress, tmp_path):
    book_dir = tmp_path / "sync-book"
    book_dir.mkdir()
    mock_push_progress.return_value = False

    payload = {"percentage": 0.5}
    res = test_client.post("/api/books/sync-book/sync", json=payload)
    assert res.status_code == 502


def test_api_sync_nonexistent_book(tmp_path):
    res_get = test_client.get("/api/books/nonexistent-book/sync")
    assert res_get.status_code == 404

    res_post = test_client.post("/api/books/nonexistent-book/sync", json={"percentage": 0.5})
    assert res_post.status_code == 404


def test_progress_to_location_fallback_no_cues(tmp_path):
    book_dir = tmp_path / "audio-only-book"
    book_dir.mkdir()
    (book_dir / "chapter_001.mp3").write_bytes(b"dummy")
    (book_dir / "chapter_002.mp3").write_bytes(b"dummy")

    # 2 chapters, each weight 100
    ch1, cue1 = progress_to_location(book_dir, 0.1)
    assert ch1 == "chapter_001"
    assert cue1 is None

    ch2, cue2 = progress_to_location(book_dir, 0.8)
    assert ch2 == "chapter_002"
    assert cue2 is None

    p = location_to_progress(book_dir, "chapter_002")
    assert pytest.approx(p, 0.01) == 0.5

