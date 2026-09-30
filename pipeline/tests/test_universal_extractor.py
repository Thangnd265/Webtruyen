import io
import zipfile
from pathlib import Path
import pytest

try:
    from pipeline.universal_extractor import extract_book_chapters
except ImportError:
    from universal_extractor import extract_book_chapters


def test_extract_docx_chapters(tmp_path: Path):
    docx_file = tmp_path / "kiem_dao_doc_ton.docx"

    # Construct valid DOCX xml
    doc_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
            <w:p><w:r><w:t>Chương 1: Xuất thế</w:t></w:r></w:p>
            <w:p><w:r><w:t>Thiếu niên đứng trên đỉnh núi tuyết, tay cầm huyền kiếm.</w:t></w:r></w:p>
            <w:p><w:r><w:t>Chương 2: Tông môn</w:t></w:r></w:p>
            <w:p><w:r><w:t>Hắn bước xuống chân núi tiến vào sơn môn Huyền Kiếm Tông.</w:t></w:r></w:p>
        </w:body>
    </w:document>
    """
    with zipfile.ZipFile(docx_file, "w") as z:
        z.writestr("word/document.xml", doc_xml.encode("utf-8"))

    meta, chapters = extract_book_chapters(docx_file)

    assert "Kiem Dao Doc Ton" in meta["title"]
    assert len(chapters) == 2
    assert "Chương 1" in chapters[0]["title"]
    assert "núi tuyết" in chapters[0]["html"]
    assert "Chương 2" in chapters[1]["title"]
    assert "Huyền Kiếm Tông" in chapters[1]["html"]


def test_extract_pdf_chapters(tmp_path: Path):
    import pymupdf

    pdf_file = tmp_path / "bach_luyen_thanh_tien.pdf"
    doc = pymupdf.open()
    doc.set_metadata({"title": "Bách Luyện Thành Tiên", "author": "Huyễn Vũ"})

    # Page 1
    p1 = doc.new_page()
    p1.insert_text((50, 50), "Hắn là một phàm nhân tu tiên.")

    # Page 2
    p2 = doc.new_page()
    p2.insert_text((50, 50), "Tại đỉnh núi có một khu vườn kỳ lạ.")

    # Set bookmarks TOC
    doc.set_toc([
        [1, "Chương 1: Thiếu niên Lâm Hiên", 1],
        [1, "Chương 2: Dược viên tẩy tủy", 2],
    ])

    doc.save(str(pdf_file))
    doc.close()

    meta, chapters = extract_book_chapters(pdf_file)

    assert meta["title"] == "Bách Luyện Thành Tiên"
    assert meta["author"] == "Huyễn Vũ"
    assert "cover_bytes" in meta
    assert len(chapters) == 2
    assert "Chương 1" in chapters[0]["title"]
    assert "Lâm Hiên" in chapters[0]["title"]
    assert "Chương 2" in chapters[1]["title"]


def test_extract_fb2_chapters(tmp_path: Path):
    fb2_file = tmp_path / "tien_nghich.fb2"
    fb2_content = """<?xml version="1.0" encoding="utf-8"?>
    <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
        <description>
            <title-info>
                <book-title>Tiên Nghịch</book-title>
                <author>
                    <first-name>Nhĩ</first-name>
                    <last-name>Căn</last-name>
                </author>
                <annotation><p>Hành trình nghịch thiên tu tiên của Vương Lâm.</p></annotation>
            </title-info>
        </description>
        <body>
            <section>
                <title><p>Chương 1: Vương Lâm</p></title>
                <p>Một góc núi non heo hút tại nước Triệu.</p>
            </section>
            <section>
                <title><p>Chương 2: Hằng Nhạc Phái</p></title>
                <p>Tứ thúc dẫn Vương Lâm đến trước cổng sơn phái.</p>
            </section>
        </body>
    </FictionBook>
    """
    fb2_file.write_text(fb2_content, encoding="utf-8")

    meta, chapters = extract_book_chapters(fb2_file)

    assert meta["title"] == "Tiên Nghịch"
    assert "Nhĩ Căn" in meta["author"]
    assert len(chapters) == 2
    assert "Chương 1" in chapters[0]["title"]
    assert "Vương Lâm" in chapters[0]["html"]
    assert "Chương 2" in chapters[1]["title"]


def test_extract_html_chapters(tmp_path: Path):
    html_file = tmp_path / "web_novel.html"
    html_content = """<!DOCTYPE html>
    <html>
    <head><title>Ma Đạo Tổ Sư</title><meta name="author" content="Mặc Hương Đồng Khứu"></head>
    <body>
        <h1>Chương 1: Trùng sinh</h1>
        <p>Ngụy Vô Tiện mở mắt ra tại Mạc Huyền Vũ thân xác.</p>
        <h1>Chương 2: Đại náo Mạc gia</h1>
        <p>Hắn vung roi đánh đuổi đám người hống hách.</p>
    </body>
    </html>
    """
    html_file.write_text(html_content, encoding="utf-8")

    meta, chapters = extract_book_chapters(html_file)

    assert meta["title"] == "Ma Đạo Tổ Sư"
    assert meta["author"] == "Mặc Hương Đồng Khứu"
    assert len(chapters) == 2
    assert "Chương 1" in chapters[0]["title"]
    assert "Ngụy Vô Tiện" in chapters[0]["html"]


def test_extract_unsupported_format(tmp_path: Path):
    invalid_file = tmp_path / "sample.xyz"
    invalid_file.write_text("Hello", encoding="utf-8")

    with pytest.raises(ValueError, match="Unsupported format"):
        extract_book_chapters(invalid_file)
