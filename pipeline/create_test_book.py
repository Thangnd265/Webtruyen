from pathlib import Path

sample_text = """Title: Thử Nghiệm Tự Động Hóa
Author: Thang PC

Chương 1: Khởi đầu hành trình mới
Lục Thần mở mắt ra nhìn quanh bốn phía. Khí tức thanh tân tràn ngập không gian. Thế giới huyền huyễn đã chính thức mở ra trước mắt.
"""

target = Path("/mnt/gdrive/audiobooks/incoming_books/kiem_tra_tu_dong.txt")
target.write_text(sample_text, encoding="utf-8")
print(f"Created test novel at {target} ({target.stat().st_size} bytes)")
