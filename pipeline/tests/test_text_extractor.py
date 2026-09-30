from pathlib import Path
import pytest
try:
    from pipeline.text_extractor import extract_txt_chapters
except ImportError:
    from text_extractor import extract_txt_chapters


def test_extract_txt_with_chapters(tmp_path: Path):
    txt_file = tmp_path / "dau_pha_thuong_khung.txt"
    txt_file.write_text(
        """Tên truyện: Đấu Phá Thương Khung
Tác giả: Thiên Tằm Thổ Đậu

Đây là câu chuyện về một thế giới thuộc về Đấu khí, không có hoa tiếu diễm lệ ma pháp.

Chương 1: Thiên tài biến thành phế vật
Tiêu Viêm ngồi trên bãi cỏ, nhìn lên bầu trời đêm. Năm đó hắn mười một tuổi đã đột phá Đấu Giả.
Nhưng ba năm qua, đấu khí của hắn không ngừng giảm sút.

Chương 2: Đấu Khí Các
Hôm nay là ngày thử nghiệm đấu khí hàng năm của gia tộc Tiêu gia.
Trưởng lão bước lên đài cao, giọng vang dội.
""",
        encoding="utf-8",
    )

    metadata, chapters = extract_txt_chapters(txt_file)

    assert metadata["title"] == "Đấu Phá Thương Khung"
    assert metadata["author"] == "Thiên Tằm Thổ Đậu"
    assert len(chapters) == 2
    assert chapters[0]["id"] == "chapter_001"
    assert "Chương 1" in chapters[0]["title"]
    assert "Tiêu Viêm" in chapters[0]["html"]
    assert chapters[1]["id"] == "chapter_002"
    assert "Chương 2" in chapters[1]["title"]
    assert "Đấu Khí Các" in chapters[1]["title"]


def test_extract_txt_single_chapter(tmp_path: Path):
    txt_file = tmp_path / "truyen_ngan.txt"
    txt_file.write_text("Một buổi sáng mùa thu yên tĩnh. Gió heo may thổi nhẹ qua rặng cây.", encoding="utf-8")

    metadata, chapters = extract_txt_chapters(txt_file)

    assert metadata["title"] == "Truyen Ngan"
    assert len(chapters) == 1
    assert chapters[0]["id"] == "chapter_001"
    assert "Một buổi sáng mùa thu" in chapters[0]["html"]
