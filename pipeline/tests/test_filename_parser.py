import pytest
import re
from pathlib import Path


def parse_book_filename(filename: str):
    stem = Path(filename).stem
    voice = None
    start_chapter = 1
    max_chapters = None

    # 1. Check voice tag
    voice_map = {
        "thienminh": "Thiện Minh",
        "ngochuyen": "Ngọc Huyền",
        "quynhanh": "Quỳnh Anh",
        "haidang": "Hải Đăng",
        "thaison": "Thái Sơn",
        "myduyen": "Mỹ Duyên",
        "quangson": "Quang Sơn",
        "custom": "Custom Voice",
    }
    for v_key, v_name in voice_map.items():
        v_pattern = re.compile(rf"[_\-\s]+{v_key}$", re.IGNORECASE)
        if v_pattern.search(stem):
            voice = v_name
            stem = v_pattern.sub("", stem)
            break

    # 2. Check chapter range: e.g. _ch101-200 or [ch101-200]
    range_match = re.search(r"[_\-\s\(\[]+ch(?:apter)?[\s_-]*(\d+)[-_](\d+)[\]\)]*$", stem, re.IGNORECASE)
    if range_match:
        start_chapter = int(range_match.group(1))
        end_chapter = int(range_match.group(2))
        max_chapters = max(1, end_chapter - start_chapter + 1)
        stem = stem[:range_match.start()]
    else:
        # 3. Check chapter count: e.g. _100ch, _100_chuong, _100c, [100], (50)
        count_match = re.search(r"[_\-\s\(\[]+(?:limit[_\s-]*)?(\d+)[_\s]*(?:ch|c|chuong|chương)?[\]\)]*$", stem, re.IGNORECASE)
        if count_match:
            # Check if this number is likely a chapter limit
            max_chapters = int(count_match.group(1))
            stem = stem[:count_match.start()]

    # Clean title
    clean_title = re.sub(r"[_\s]+", " ", stem).strip()
    return {
        "clean_title": clean_title,
        "start_chapter": start_chapter,
        "max_chapters": max_chapters,
        "voice": voice,
    }


def test_parse_simple_count():
    res = parse_book_filename("Vo_Luyen_Dinh_Phong_100ch.epub")
    assert res["clean_title"] == "Vo Luyen Dinh Phong"
    assert res["max_chapters"] == 100
    assert res["start_chapter"] == 1
    assert res["voice"] is None

def test_parse_chuong():
    res = parse_book_filename("Pham_Nhan_Tu_Tien_50_chuong.txt")
    assert res["clean_title"] == "Pham Nhan Tu Tien"
    assert res["max_chapters"] == 50
    assert res["start_chapter"] == 1

def test_parse_brackets():
    res = parse_book_filename("Dau_Pha_Thuong_Khung[80].epub")
    assert res["clean_title"] == "Dau Pha Thuong Khung"
    assert res["max_chapters"] == 80
    assert res["start_chapter"] == 1

def test_parse_range():
    res = parse_book_filename("Tien_Nghich_ch101-200.epub")
    assert res["clean_title"] == "Tien Nghich"
    assert res["start_chapter"] == 101
    assert res["max_chapters"] == 100

def test_parse_with_voice():
    res = parse_book_filename("Kiem_Hiep_100ch_thienminh.epub")
    assert res["clean_title"] == "Kiem Hiep"
    assert res["max_chapters"] == 100
    assert res["voice"] == "Thiện Minh"

def test_parse_plain():
    res = parse_book_filename("Truyen_Binh_Thuong.epub")
    assert res["clean_title"] == "Truyen Binh Thuong"
    assert res["max_chapters"] is None
    assert res["start_chapter"] == 1
    assert res["voice"] is None

if __name__ == "__main__":
    test_parse_simple_count()
    test_parse_chuong()
    test_parse_brackets()
    test_parse_range()
    test_parse_with_voice()
    test_parse_plain()
    print("All tests passed successfully!")
