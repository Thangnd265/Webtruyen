# 📚 Webtruyenv2 - Nền Tảng Đọc Truyện & Nghe Sách Nói Karaoke Đồng Bộ

[![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-38bdf8.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-49%20Passed-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

> **Webtruyenv2** là nền tảng đọc tiểu thuyết mạng và nghe sách nói audio chất lượng cao với khả năng **đồng bộ thời gian thực kiểu Karaoke**, giao diện nguyên bản chuẩn xác 100% theo phong cách **tieuthuyetmang.com**, tích hợp **hệ thống Plugin Theme độc lập**, đồng bộ tiến độ 2 chiều với máy đọc sách **Kindle KOReader** qua Kosync, và tiêu thụ **0 MB ổ cứng cục bộ** nhờ kết nối trực tiếp kho lưu trữ đám mây.

---

## 🌟 Các Tính Năng Nổi Bật

### 1. 🎧 Trình Phát Audio & Đồng Bộ Karaoke Real-time
- **Karaoke Highlighting**: Từng câu thoại/văn bản được tô sáng tự động theo giọng đọc thời gian thực (`.active-cue`).
- **Interactive Click-to-Play**: Nhấp chuột hoặc chạm vào bất kỳ câu nào trong chương để trình phát nhảy ngay đến đoạn audio tương ứng.
- **Auto-scroll thông minh**: Tự động cuộn trang mượt mà đưa đoạn văn bản đang đọc vào trung tâm màn hình, có nút bật/tắt tiện dụng.
- **Trình phát đĩa than Vinyl**: Hiệu ứng đĩa than quay `audio-disc-spin` với rãnh vinyl ánh quang khi phát nhạc.
- **Điều khiển chuyên sâu**: Tua `-10s` / `+10s`, thanh tua Scrubber gradient, chọn tốc độ (0.75x, 1.0x, 1.25x, 1.5x, 2.0x), hẹn giờ tắt (15m, 30m, 45m, 60m, hết chương).
- **MediaSession API**: Hỗ trợ đầy đủ hiển thị bìa truyện, tên chương và nút điều khiển ngay trên màn hình khóa của iPhone/iPad (Safari) và Android (Chrome).

### 2. 🎨 Hệ Thống Plugin Theme Độc Lập (Theme Plugins)
- Không hardcode màu sắc trong mã nguồn HTML/JS. Giao diện được điều khiển hoàn toàn bởi **Theme Engine** và các file cấu hình JSON độc lập trong `frontend/plugins/themes/`.
- Hỗ trợ nạp động (hot-reload), chuyển đổi giao diện tức thì và lưu vào `localStorage`:
  - 🌙 **Tieuthuyetmang Dark**: Phong cách huyền ảo đêm trăng nguyên bản (`#0f172a`, `#1e293b`).
  - ☀️ **Tieuthuyetmang Light**: Tươi sáng, thanh lịch, nền trắng ngà bảo vệ mắt (`#f8fafc`).
  - 📜 **Tieuthuyetmang Sepia**: Tông màu giấy cổ vàng ấm áp chống mỏi mắt đêm khuya (`#fbf0d9`).
  - 🖤 **OLED Pure Black**: Đen tuyệt đối (`#000000`) tối ưu pin cho màn hình OLED/AMOLED.
- **Dễ dàng mở rộng**: Bạn chỉ cần tạo một file JSON mới (ví dụ: `cyberpunk.theme.json`) và nạp vào thư mục plugin là giao diện mới tự động xuất hiện!

### 3. 📖 Trình Đọc Chữ Chuyên Nghiệp (ReadNavBar & Aa Controls)
- Header đọc thanh lịch với nút quay lại danh sách chương và thanh công cụ tiện ích.
- Popover cài đặt `Aa`:
  - Lựa chọn Font chữ: **Sans-serif** (Inter / Modern) hoặc **Serif** (Merriweather / Bookerly).
  - Tùy chỉnh kích thước chữ linh hoạt từ 14px đến 24px.
  - Tùy chỉnh độ giãn dòng (Line Height) từ 1.5 đến 4.0.
  - Tùy chọn màu nền trang đọc độc lập với theme tổng thể.

### 4. 🔄 Đồng Bộ Tiến Độ 2 Chiều Với Kindle (Kosync Engine)
- Tích hợp trực tiếp với máy chủ **Kosync Server** (hệ thống đồng bộ cho ứng dụng KOReader trên máy đọc sách Kindle, Kobo, Boox).
- Đọc dở trên Kindle vào ban ngày, mở Web Reader trên điện thoại/máy tính vào ban đêm: hệ thống tự động phát hiện và hiển thị hộp thoại *"Bạn đã đọc đến 45.2% trên Kindle. Bạn có muốn tiếp tục từ đây?"*.
- Tự động lưu tiến độ đọc lên server định kỳ hoặc khi tạm dừng audio.

### 5. ⚡ Truyền Tải Âm Thanh Siêu Tốc (RFC 7233 HTTP 206 Partial Content)
- Backend FastAPI hỗ trợ chuẩn Range Requests cho phép tua audio tới bất kỳ giây nào mà không cần tải trước toàn bộ file MP3/M4B.
- Tối ưu hóa độ trễ, phát ngay lập tức sau 50ms ngay cả khi file âm thanh nặng hàng trăm MB.

### 6. 🎙️ Hệ Thống Giọng Đọc Đa Dạng & Hot-swap
- Tích hợp các preset giọng đọc Neural chất lượng cao:
  - 👩 Giọng Nữ Tiêu Chuẩn (`vi-VN-HoaiMyNeural`)
  - 👨 Giọng Nam Trầm Ấm (`vi-VN-NamMinhNeural`)
  - 👩‍🦰 Giọng Nữ Trẻ Trung (+12Hz Pitch)
  - 👵 Giọng Nữ Trầm Lắng (-8Hz Pitch)
  - 🧔 Giọng Nam Hào Hùng (+10Hz Pitch)
  - 👴 Giọng Nam Già / Cổ Trang (-15Hz Pitch)
- Cho phép đổi giọng đọc trực tiếp trong lúc đang nghe mà vẫn giữ nguyên vị trí giây hiện tại.

### 7. ☁️ Kiến Trúc Tiêu Tốn 0 MB Ổ Cứng Cục Bộ
- Sử dụng Rclone mount Google Drive 5TB với VFS Cache, toàn bộ file âm thanh và dữ liệu thời gian (`cues.json`) được đọc trực tiếp từ cloud, giải phóng 100% dung lượng ổ SSD của máy chủ.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
Webtruyenv2/
├── backend/                  # Máy chủ API (FastAPI)
│   ├── config.py             # Cấu hình biến môi trường
│   ├── kosync.py             # Engine đồng bộ 2 chiều Kosync
│   ├── main.py               # API endpoints & static file serving
│   ├── stream.py             # Streamer audio HTTP 206 Partial Content
│   ├── requirements.txt      # Thư viện Python backend
│   └── tests/                # 32 Unit tests cho backend
├── frontend/                 # Giao diện người dùng (PWA / SPA)
│   ├── index.html            # Trang chủ & danh mục truyện audio
│   ├── reader.html           # Trình đọc truyện & nghe sách nói karaoke
│   ├── css/
│   │   └── tieuthuyetmang.css # Toàn bộ stylesheet Tailwind nguyên bản
│   ├── js/
│   │   ├── navbar.js         # Header & điều hướng
│   │   ├── home.js           # Xử lý trang chủ, slider, bảng xếp hạng
│   │   └── reader.js         # Engine đọc sách, phát audio, karaoke highlight
│   ├── plugins/
│   │   └── themes/           # Hệ thống Theme Plugin
│   │       ├── theme-engine.js            # Engine nạp và chuyển theme
│   │       ├── tieuthuyetmang-dark.theme.json
│   │       ├── tieuthuyetmang-light.theme.json
│   │       ├── tieuthuyetmang-sepia.theme.json
│   │       └── oled-pure-black.theme.json
│   ├── manifest.json         # Cấu hình PWA cài đặt lên màn hình chính
│   └── sw.js                 # Service Worker hỗ trợ offline cache
├── pipeline/                 # Pipeline trích xuất văn bản & sinh TTS
│   ├── generate_audiobook.py # Tool chuyển đổi EPUB -> M4B + cues.json
│   ├── text_splitter.py      # Tách câu tiếng Việt chuẩn ngữ pháp
│   ├── generate_sample_chapter.py # Tool tạo dữ liệu mẫu kiểm thử
│   ├── requirements.txt      # Thư viện cho pipeline sinh audio
│   └── tests/                # 17 Unit tests cho pipeline
├── samples/                  # Dữ liệu sách mẫu & ảnh bìa
├── tests/                    # Scripts kiểm thử tích hợp (E2E)
│   └── e2e_reader_verification.sh
├── docs/                     # Tài liệu chuyên sâu
│   └── TRAINING_TTS.md       # Hướng dẫn chi tiết huấn luyện model TTS tiếng Việt
├── docker-compose.yml        # Docker compose sẵn sàng triển khai
├── Dockerfile                # Image Docker Python 3.12 siêu nhẹ
├── .env.example              # Mẫu biến môi trường
├── .gitignore
└── README.md                 # Tài liệu hướng dẫn sử dụng
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### Yêu Cầu Môi Trường
- **Python 3.10+** (khuyên dùng Python 3.12)
- **Docker & Docker Compose** (nếu triển khai container)
- **FFmpeg** (tùy chọn, cần thiết nếu chạy pipeline sinh audio)

---

### Cách 1: Khởi Chạy Nhanh Bằng Docker Compose (Khuyên Dùng)

1. **Clone repository:**
   ```bash
   git clone https://github.com/Thangnd265/Webtruyenv2.git
   cd Webtruyenv2
   ```

2. **Cấu hình file môi trường:**
   ```bash
   cp .env.example .env
   ```
   Chỉnh sửa đường dẫn thư mục sách trong file `.env` nếu cần:
   ```env
   PORT=3080
   AUDIOBOOKS_DIR=/mnt/gdrive/audiobooks
   KOSYNC_URL=http://192.168.1.103:8085
   ```

3. **Khởi chạy container:**
   ```bash
   docker compose up -d --build
   ```

4. **Truy cập ứng dụng:**
   Mở trình duyệt và vào: `http://localhost:3080` (hoặc domain cấu hình trên Reverse Proxy).

---

### Cách 2: Chạy Trực Tiếp Bằng Python (Cho Lập Trình Viên)

1. **Tạo và kích hoạt môi trường ảo:**
   ```bash
   # Trên Linux/macOS:
   python3 -m venv venv
   source venv/bin/activate

   # Trên Windows (PowerShell):
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

2. **Cài đặt thư viện dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Thiết lập biến môi trường (hoặc để mặc định):**
   ```bash
   # Windows PowerShell
   $env:AUDIOBOOKS_DIR = "$PWD\samples"
   $env:PORT = "3080"

   # Linux / macOS
   export AUDIOBOOKS_DIR="$(pwd)/samples"
   export PORT=3080
   ```

4. **Khởi động server Uvicorn:**
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 3080 --reload
   ```

5. **Trải nghiệm:**
   Mở trình duyệt: `http://localhost:3080`

---

## 🧪 Chạy Kiểm Thử (Automated Tests)

Repository đi kèm bộ kiểm thử tự động toàn diện (49 tests) bao quát API, range streaming, đồng bộ Kosync, và pipeline tách câu.

Chạy toàn bộ test suite bằng lệnh:
```bash
pytest
```

Chạy riêng kiểm thử backend:
```bash
pytest backend/tests
```

Chạy riêng kiểm thử pipeline TTS:
```bash
pytest pipeline/tests
```

---

## 🎨 Hướng Dẫn Tự Tạo Plugin Theme Mới

Hệ thống theme được thiết kế dưới dạng **Plugin mở**. Để thêm một giao diện mới mà không phải sửa code:

1. Tạo một file `.theme.json` mới trong thư mục `frontend/plugins/themes/`, ví dụ `frontend/plugins/themes/matrix-green.theme.json`.
2. Định nghĩa cấu trúc theme:
   ```json
   {
     "id": "matrix-green",
     "name": "Matrix Cyber Green",
     "author": "YourName",
     "version": "1.0.0",
     "variables": {
       "--bg-primary": "#0d1117",
       "--bg-secondary": "#161b22",
       "--bg-card": "#0a0e14",
       "--text-primary": "#00ff66",
       "--text-secondary": "#00cc55",
       "--text-muted": "#00883a",
       "--accent-primary": "#00ff66",
       "--accent-hover": "#33ff88",
       "--border-color": "#00441b",
       "--karaoke-highlight-bg": "rgba(0, 255, 102, 0.18)",
       "--karaoke-highlight-border": "#00ff66"
     }
   }
   ```
3. Đăng ký tên file vào danh sách plugins trong `frontend/plugins/themes/theme-engine.js`.
4. Mở web reader và chọn theme mới trong danh sách!

---

## 📡 Danh Sách API Endpoints (FastAPI Backend)

| Phương thức | Đường dẫn | Mô tả chức năng |
|---|---|---|
| `GET` | `/api/books` | Danh sách toàn bộ sách có trong thư viện |
| `GET` | `/api/books/{slug}` | Chi tiết thông tin sách & danh mục các chương |
| `GET` | `/api/books/{slug}/cover` | Lấy ảnh bìa sách (JPEG, PNG, WebP, SVG) |
| `GET` | `/api/books/{slug}/chapters/{id}` | Lấy nội dung HTML và danh sách tọa độ thời gian `cues` |
| `GET/HEAD` | `/api/books/{slug}/audio/{id}` | Stream file âm thanh hỗ trợ RFC 7233 HTTP 206 Range |
| `GET` | `/api/books/{slug}/sync` | Lấy tiến độ đọc mới nhất từ Kosync Server |
| `POST` | `/api/books/{slug}/sync` | Lưu vị trí đọc hiện tại (% và chương/câu) lên Kosync Server |

---

## 🤖 Huấn Luyện & Tích Hợp Mô Hình TTS Tiếng Việt

Xem tài liệu hướng dẫn đầy đủ tại: **[docs/TRAINING_TTS.md](docs/TRAINING_TTS.md)**
- Quy chuẩn thu âm và xử lý dataset sách nói tiếng Việt (24kHz Mono WAV).
- Tiền xử lý văn bản, tách từ, đánh trọng âm và dấu thanh (Phonemizer).
- Huấn luyện mô hình TTS hiện đại (VieNeu-TTS / VITS / XTTS-v2).
- Quy trình tự động xuất file âm thanh và file tọa độ thời gian `cues.json` chạy trực tiếp trong RAM (`/dev/shm`) mà không cần Whisper alignment.

---

## 🤝 Hướng Dẫn Dành Cho Bạn Bè & Cộng Tác Viên

1. **Fork** repository này về tài khoản GitHub của bạn.
2. Tạo nhánh tính năng mới: `git checkout -b feature/tinh-nang-moi`.
3. Commit các thay đổi: `git commit -m "feat: thêm tính năng mới"`.
4. Đẩy code lên nhánh của bạn: `git push origin feature/tinh-nang-moi`.
5. Tạo **Pull Request** để cùng thảo luận và tích hợp code!

---

## 📄 Bản Quyền & Giấy Phép
Dự án được phát triển dưới giấy phép mã nguồn mở MIT License. Tự do sử dụng, chỉnh sửa và đóng góp cho cộng đồng yêu thích sách nói!
