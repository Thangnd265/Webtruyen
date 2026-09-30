# 📥 THƯ MỤC THẢ TRUYỆN TỰ ĐỘNG (INCOMING BOOKS)

Thư mục này được giám sát tự động bởi tiến trình `pipeline/watcher.py`.

### 📌 Cách sử dụng:
1. **Thả file truyện vào đây**:
   - Hỗ trợ định dạng: **`.epub`** hoặc **`.txt`**
2. **Hệ thống tự động**:
   - Tự động phát hiện file mới sau 5 giây.
   - Tự động trích xuất tên truyện, tác giả, ảnh bìa và chia từng chương.
   - Gọi AI **VieNeu-TTS** (giọng Hải Đăng / Ngọc Huyền) đọc từng câu và tạo file đồng bộ Karaoke (`cues.json`).
   - Đẩy trực tiếp vào thư mục web `samples/` (hoặc `/mnt/gdrive/audiobooks/`).
   - Sau khi hoàn thành, file gốc sẽ được chuyển vào thư mục con `done/`.
   - Nếu có lỗi, file gốc sẽ được chuyển vào `failed/` kèm file log chi tiết.

### 🚀 Khởi chạy Watcher:
Mở terminal và chạy lệnh:
```powershell
python pipeline/watcher.py
```
Hoặc chạy với giọng Ngọc Huyền:
```powershell
python pipeline/watcher.py --voice "Ngọc Huyền"
```
