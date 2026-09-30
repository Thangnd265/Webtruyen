from pathlib import Path

content = """Title: Kiếm Hiệp Tình Duyên
Author: Tiêu Dao

Chương 1: Xuất sơn
Đệ nhất kiếm khách bước xuống núi.

Chương 2: Gặp gỡ hồng nhan
Bên dòng suối trong vắt, giai nhân đang gảy đàn.

Chương 3: Hắc y nhân tập kích
Một đạo hắc ảnh bất ngờ lao ra từ trong rừng trúc.

Chương 4: Quyết chiến đỉnh Phong Lôi
Kiếm khí ngút trời bao trùm cả ngọn núi.

Chương 5: Bế mạc giang hồ
Kiếm khách thu kiếm về vỏ, tiêu sái rời đi.
"""

target = Path("/mnt/gdrive/audiobooks/incoming_books/Kiem_Hiep_Tinh_Duyen_2ch.txt")
target.write_text(content, encoding="utf-8")
print(f"Created multi-chapter test book at {target}")
