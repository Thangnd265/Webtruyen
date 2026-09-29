import json
import pytest
from fastapi.testclient import TestClient
from apps.web_reader.backend.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_books_empty(tmp_path):
    response = client.get("/api/books")
    assert response.status_code == 200
    assert response.json() == []


def test_list_and_get_books(tmp_path):
    # Book 1: with metadata.json
    book1_dir = tmp_path / "truyen-kieu"
    book1_dir.mkdir(parents=True)
    meta = {
        "title": "Truyện Kiều",
        "author": "Nguyễn Du",
        "description": "Kiệt tác truyện thơ Việt Nam",
        "cover_url": "https://example.com/kieu.jpg",
        "chapters": [
            {
                "id": "chapter_001",
                "title": "Chương 1: Mở đầu",
                "chapter_index": 1,
                "audio_url": "/api/books/truyen-kieu/audio/chapter_001",
            }
        ],
    }
    (book1_dir / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    (book1_dir / "chapter_001.m4b").write_bytes(b"dummy")

    # Book 2: fallback without metadata.json
    book2_dir = tmp_path / "de-men"
    book2_dir.mkdir(parents=True)
    (book2_dir / "chapter_001.mp3").write_bytes(b"dummy")
    (book2_dir / "chapter_002.mp3").write_bytes(b"dummy")

    # Test GET /api/books
    response = client.get("/api/books")
    assert response.status_code == 200
    books = response.json()
    assert len(books) == 2

    # Map by slug
    book_by_slug = {b["slug"]: b for b in books}
    assert "truyen-kieu" in book_by_slug
    assert book_by_slug["truyen-kieu"]["title"] == "Truyện Kiều"
    assert book_by_slug["truyen-kieu"]["author"] == "Nguyễn Du"
    assert book_by_slug["truyen-kieu"]["total_chapters"] == 1

    assert "de-men" in book_by_slug
    assert book_by_slug["de-men"]["title"] == "De Men"
    assert book_by_slug["de-men"]["author"] == "Unknown"
    assert book_by_slug["de-men"]["total_chapters"] == 2

    # Test GET /api/books/{slug}
    res_kieu = client.get("/api/books/truyen-kieu")
    assert res_kieu.status_code == 200
    data_kieu = res_kieu.json()
    assert data_kieu["slug"] == "truyen-kieu"
    assert len(data_kieu["chapters"]) == 1
    assert data_kieu["chapters"][0]["id"] == "chapter_001"

    # Test GET /api/books/nonexistent -> 404
    res_404 = client.get("/api/books/nonexistent-book")
    assert res_404.status_code == 404


def test_get_chapter_with_html_and_cues(tmp_path):
    book_dir = tmp_path / "test-novel"
    book_dir.mkdir(parents=True)

    cues_data = [
        {"id": "cue-1", "start": 0.0, "end": 4.25, "text": "Trăm năm trong cõi người ta."},
        {"id": "cue-2", "start": 4.25, "end": 8.5, "text": "Chữ tài chữ mệnh khéo là ghét nhau."},
    ]
    (book_dir / "chapter_001_cues.json").write_text(json.dumps(cues_data, ensure_ascii=False), encoding="utf-8")
    (book_dir / "chapter_001.html").write_text(
        '<p id="cue-1" data-start="0.0" data-end="4.25" class="reader-paragraph">Trăm năm trong cõi người ta.</p>\n'
        '<p id="cue-2" data-start="4.25" data-end="8.5" class="reader-paragraph">Chữ tài chữ mệnh khéo là ghét nhau.</p>',
        encoding="utf-8",
    )

    response = client.get("/api/books/test-novel/chapters/chapter_001")
    assert response.status_code == 200
    data = response.json()
    assert data["chapter_id"] == "chapter_001"
    assert len(data["cues"]) == 2
    assert data["cues"][0]["id"] == "cue-1"
    assert data["cues"][0]["text"] == "Trăm năm trong cõi người ta."
    assert '<p id="cue-1"' in data["html"]
    assert data["audio_url"] == "/api/books/test-novel/audio/chapter_001"


def test_get_chapter_generates_html_from_cues_if_html_missing(tmp_path):
    book_dir = tmp_path / "test-novel"
    book_dir.mkdir(parents=True, exist_ok=True)

    cues_data = [
        {"id": "cue-1", "start": 10.0, "end": 15.0, "text": "Đây là câu văn tự sinh."},
    ]
    (book_dir / "chapter_002_cues.json").write_text(json.dumps(cues_data, ensure_ascii=False), encoding="utf-8")

    response = client.get("/api/books/test-novel/chapters/chapter_002")
    assert response.status_code == 200
    data = response.json()
    assert data["chapter_id"] == "chapter_002"
    assert len(data["cues"]) == 1
    assert '<p id="cue-1" data-start="10.0" data-end="15.0" class="reader-paragraph">Đây là câu văn tự sinh.</p>' in data["html"]


def test_get_chapter_not_found(tmp_path):
    book_dir = tmp_path / "test-novel"
    book_dir.mkdir(parents=True, exist_ok=True)

    res_missing_chapter = client.get("/api/books/test-novel/chapters/chapter_999")
    assert res_missing_chapter.status_code == 404

    res_missing_book = client.get("/api/books/nonexistent/chapters/chapter_001")
    assert res_missing_book.status_code == 404


def test_frontend_static_serving():
    # Test root / serves index.html
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "text/html" in res_root.headers.get("content-type", "")
    assert "Tiểu Thuyết Mạng" in res_root.text
    assert "manifest.json" in res_root.text

    # Test reader.html
    res_reader = client.get("/reader.html")
    assert res_reader.status_code == 200
    assert "text/html" in res_reader.headers.get("content-type", "")
    assert "content-area" in res_reader.text
    assert "chapter-drawer" in res_reader.text
    assert "audio-scrubber" in res_reader.text
    assert "settings-popover" in res_reader.text

    # Test CSS
    res_css = client.get("/css/tieuthuyetmang.css")
    assert res_css.status_code == 200
    assert "text/css" in res_css.headers.get("content-type", "")
    assert "active-cue" in res_css.text

    # Test Theme Plugin Serving
    res_theme = client.get("/plugins/themes/tieuthuyetmang-dark.theme.json")
    assert res_theme.status_code == 200
    assert "tieuthuyetmang-dark" in res_theme.text

    # Test JS
    res_js = client.get("/js/reader.js")
    assert res_js.status_code == 200
    assert "javascript" in res_js.headers.get("content-type", "")
    assert "formatSeconds" in res_js.text

    # Test manifest.json
    res_manifest = client.get("/manifest.json")
    assert res_manifest.status_code == 200
    manifest_data = res_manifest.json()
    assert manifest_data["short_name"] in ["WebReader", "Tiểu Thuyết Mạng"]
    assert manifest_data["display"] == "standalone"

    # Test sw.js
    res_sw = client.get("/sw.js")
    assert res_sw.status_code == 200
    assert "webreader-cache-v1" in res_sw.text


def test_book_cover_and_svg_fallback(tmp_path):
    # Book with cover image
    book_dir = tmp_path / "cover-story"
    book_dir.mkdir(parents=True)
    cover_file = book_dir / "cover.jpg"
    cover_file.write_bytes(b"\xff\xd8\xff\xe0" + b"fake-jpeg")

    res = client.get("/api/books/cover-story/cover")
    assert res.status_code == 200
    assert "image/jpeg" in res.headers.get("content-type", "")

    # Book without cover image -> SVG fallback
    book_no_cover = tmp_path / "no-cover-story"
    book_no_cover.mkdir(parents=True)
    res_fallback = client.get("/api/books/no-cover-story/cover")
    assert res_fallback.status_code == 200
    assert "image/svg+xml" in res_fallback.headers.get("content-type", "")
    assert "<svg" in res_fallback.text


def test_path_traversal_rejection(tmp_path):
    # Invalid characters in slug or chapter_id must return 400
    res1 = client.get("/api/books/..%2f..%2fetc/chapters/chapter_001")
    assert res1.status_code in [400, 404]

    res2 = client.get("/api/books/sample-story/chapters/..%2f..%2fpasswd")
    assert res2.status_code in [400, 404]

    res3 = client.get("/api/books/sample-story/audio/..%2f..%2fpasswd")
    assert res3.status_code in [400, 404]


