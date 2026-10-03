import os
import pytest
from fastapi.testclient import TestClient
from apps.web_reader.backend.main import app

client = TestClient(app)


def test_stream_audio_partial_content(tmp_path):
    # Create a dummy audio file of 1000 bytes
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True)
    audio_file = audio_dir / "chapter_001.m4b"
    audio_file.write_bytes(b"A" * 1000)

    # Request first 100 bytes via HTTP Range
    headers = {"Range": "bytes=0-99"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)

    assert response.status_code == 206
    assert response.headers["Content-Range"] == "bytes 0-99/1000"
    assert len(response.content) == 100
    assert response.headers["Accept-Ranges"] == "bytes"
    assert response.headers["Content-Type"] == "audio/mp4"


def test_stream_audio_full_content(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.mp3"
    audio_file.write_bytes(b"B" * 500)

    # No Range header -> 200 OK
    response = client.get("/api/books/test-book/audio/chapter_001")
    assert response.status_code == 200
    assert response.headers["Content-Length"] == "500"
    assert response.headers["Accept-Ranges"] == "bytes"
    assert len(response.content) == 500
    assert response.headers["Content-Type"] == "audio/mpeg"


def test_stream_audio_range_to_end(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.m4b"
    audio_file.write_bytes(b"C" * 1000)

    # Range from 800 to end
    headers = {"Range": "bytes=800-"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 206
    assert response.headers["Content-Range"] == "bytes 800-999/1000"
    assert len(response.content) == 200


def test_stream_audio_suffix_range(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.m4b"
    # Write 900 bytes of 'X' and 100 bytes of 'Y'
    audio_file.write_bytes(b"X" * 900 + b"Y" * 100)

    # RFC 7233 Suffix range: last 100 bytes
    headers = {"Range": "bytes=-100"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 206
    assert response.headers["Content-Range"] == "bytes 900-999/1000"
    assert response.headers["Content-Length"] == "100"
    assert response.content == b"Y" * 100


def test_stream_audio_not_found(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)

    response = client.get("/api/books/test-book/audio/non_existent")
    assert response.status_code == 404


def test_stream_audio_invalid_range(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.m4b"
    audio_file.write_bytes(b"D" * 100)

    # Range beyond file size
    headers = {"Range": "bytes=200-300"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 416

    # Range start > end
    headers = {"Range": "bytes=50-20"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 416

    # Malformed range: non-numeric
    headers = {"Range": "bytes=invalid"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 416

    # Malformed range: invalid characters
    headers = {"Range": "bytes=abc-def"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 416

    # Malformed range: missing bytes= prefix
    headers = {"Range": "10-20"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 416


def test_cors_headers_exposed(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.m4b"
    audio_file.write_bytes(b"A" * 100)

    headers = {"Origin": "http://localhost:3000"}
    response = client.get("/api/books/test-book/audio/chapter_001", headers=headers)
    assert response.status_code == 200
    expose = response.headers.get("access-control-expose-headers", "")
    assert "Content-Range" in expose
    assert "Accept-Ranges" in expose
    assert "Content-Length" in expose


def test_stream_audio_head_method(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.mp3"
    audio_file.write_bytes(b"D" * 750)

    response = client.head("/api/books/test-book/audio/chapter_001")
    assert response.status_code == 200
    assert response.headers["Content-Length"] == "750"
    assert response.headers["Accept-Ranges"] == "bytes"
    assert response.headers["Content-Type"] == "audio/mpeg"
    assert len(response.content) == 0


def test_stream_audio_with_voice_param(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_female = audio_dir / "chapter_001.mp3"
    audio_female.write_bytes(b"F" * 600)
    audio_male = audio_dir / "chapter_001_male.mp3"
    audio_male.write_bytes(b"M" * 800)

    # Request with voice=male -> should return male file (800 bytes)
    response_male = client.get("/api/books/test-book/audio/chapter_001?voice=male")
    assert response_male.status_code == 200
    assert response_male.headers["Content-Length"] == "800"
    assert len(response_male.content) == 800

    # Request with voice=female (or default) -> should return female file (600 bytes)
    response_female = client.get("/api/books/test-book/audio/chapter_001?voice=female")
    assert response_female.status_code == 200
    assert response_female.headers["Content-Length"] == "600"


def test_stream_audio_voice_fallback_when_voice_file_missing(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_default = audio_dir / "chapter_001.mp3"
    audio_default.write_bytes(b"D" * 500)

    # Request a voice that doesn't have a pre-rendered file -> falls back gracefully to default
    response = client.get("/api/books/test-book/audio/chapter_001?voice=unknown_voice")
    assert response.status_code == 200
    assert response.headers["Content-Length"] == "500"


def test_stream_audio_cache_control_headers(tmp_path):
    audio_dir = tmp_path / "test-book"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_file = audio_dir / "chapter_001.mp3"
    audio_file.write_bytes(b"C" * 1000)

    # Full content (200 OK)
    res_full = client.get("/api/books/test-book/audio/chapter_001")
    assert res_full.status_code == 200
    assert "public" in res_full.headers["Cache-Control"]
    assert "max-age=" in res_full.headers["Cache-Control"]

    # Partial content (206 Partial Content)
    res_range = client.get("/api/books/test-book/audio/chapter_001", headers={"Range": "bytes=0-199"})
    assert res_range.status_code == 206
    assert "public" in res_range.headers["Cache-Control"]
    assert "max-age=" in res_range.headers["Cache-Control"]

