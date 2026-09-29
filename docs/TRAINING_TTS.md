# 🎙️ Hướng Dẫn Huấn Luyện & Clone Giọng Đọc AI VieNeu-TTS v3 Cho Sách Nói

Tài liệu này hướng dẫn chi tiết từ A-Z cách tạo giọng đọc mới, sao chép giọng (Voice Cloning) và huấn luyện tinh chỉnh (LoRA Fine-tuning) mô hình **VieNeu-TTS v3 Turbo (48 kHz)** để phục vụ trực tiếp cho hệ thống đọc truyện **Webtruyen**.

---

## 📑 Mục Lục
1. [Tổng Quan Về VieNeu-TTS v3 Turbo](#1-tổng-quan-về-vieneu-tts-v3-turbo)
2. [Cách 1: Sao Chép Giọng Tức Thì (Instant Voice Cloning - 3 đến 8 Giây)](#2-cách-1-sao-chép-giọng-tức-thì-instant-voice-cloning---3-đến-8-giây)
3. [Cách 2: Huấn Luyện LoRA Fine-Tuning Giọng Đọc Chuyên Nghiệp](#3-cách-2-huấn-luyện-lora-fine-tuning-giọng-đọc-chuyên-nghiệp)
4. [Chuẩn Bị & Tiền Xử Lý Dữ Liệu Sách Nói Tiếng Việt](#4-chuẩn-bị--tiền-xử-lý-dữ-liệu-sách-nói-tiếng-việt)
5. [Quy Trình Train LoRA Bằng GPU](#5-quy-trình-train-lora-bằng-gpu)
6. [Xuất Checkpoint & Tích Hợp Trực Tiếp Vào Webtruyen Trên Server](#6-xuất-checkpoint--tích-hợp-trực-tiếp-vào-webtruyen-trên-server)

---

## 1. Tổng Quan Về VieNeu-TTS v3 Turbo

**VieNeu-TTS v3 Turbo** là kiến trúc mô hình Text-To-Speech tiếng Việt thế hệ mới nhất:
- **Tần số lấy mẫu**: Chuẩn phòng thu **48,000 Hz** (48 kHz High-Fidelity).
- **Audio Codec**: `MOSS-Audio-Tokenizer-Nano` nén và tái tạo âm thanh cực nét.
- **Phonemizer**: `sea-g2p` xử lý chuẩn xác 6 thanh điệu tiếng Việt (hỏi, ngã, sắc, huyền, nặng, ngang).
- **Hỗ trợ biểu cảm cảm xúc**: Thêm trực tiếp các thẻ như `[cười]`, `[thở dài]`, `[hắng giọng]` vào câu thoại.
- **Tốc độ sinh**: 
  - **Trên CPU**: RTF ≈ 0.5 – 0.8 (nhanh hơn thời gian thực, sinh 1 câu 5s chỉ mất ~3-4s).
  - **Trên GPU**: RTF ≈ 0.02 (nhanh gấp 50 lần thời gian thực, 16 luồng streaming cùng lúc).

---

## 2. Cách 1: Sao Chép Giọng Tức Thì (Instant Voice Cloning - 3 đến 8 Giây)

Nếu bạn muốn tạo một giọng đọc sách mới (ví dụ: giọng MC truyền hình, giọng đọc truyện ma, giọng cá nhân của bạn) mà **không cần tốn thời gian train**, VieNeu-TTS v3 hỗ trợ **Zero-shot Voice Cloning**.

### Bước 1: Chuẩn bị file mẫu giọng đọc
- Lấy một đoạn ghi âm giọng mẫu từ **3 đến 8 giây** (WAV hoặc MP3).
- **Yêu cầu quan trọng**: Âm thanh rõ ràng, không lẫn nhạc nền, không bị vang vọng (reverb).
- Đặt tên file: `ref_sample.wav`.

### Bước 2: Clone giọng trực tiếp qua SDK `vieneu`
```python
from vieneu import Vieneu

# Khởi tạo mô hình VieNeu-TTS v3 Turbo
vieneu = Vieneu()

# Văn bản cần đọc
text = "Đêm nay trăng thanh gió mát, Tiêu Viêm ngồi xếp bằng trên đỉnh núi, khẽ thở dài một tiếng."

# Gọi infer với tham số voice trỏ tới file mẫu giọng
audio = vieneu.infer(
    text=text,
    voice="ref_sample.wav"  # Truyền đường dẫn file âm thanh mẫu
)

# Lưu kết quả
vieneu.save(audio, "output_cloned.wav")
print("Đã clone giọng thành công!")
```

> 💡 **Ưu điểm**: Tạo ngay lập tức, không tốn tài nguyên GPU huấn luyện.

---

## 3. Cách 2: Huấn Luyện LoRA Fine-Tuning Giọng Đọc Chuyên Nghiệp

Khi bạn muốn có một giọng đọc chuyên biệt với âm sắc chuẩn xác 100%, độ ổn định tuyệt đối xuyên suốt hàng ngàn chương truyện dài tập, hãy sử dụng kỹ thuật **LoRA (Low-Rank Adaptation)**.

### Yêu Cầu Phần Cứng
- **GPU**: NVIDIA RTX 3060 (12GB VRAM), RTX 3080/4070 trở lên.
- **Thời gian huấn luyện**: Chỉ mất khoảng **30 - 60 phút** cho 1 giọng đọc.
- **Thời lượng dữ liệu thu âm**: Chỉ cần **15 đến 45 phút** âm thanh chất lượng cao.

---

## 4. Chuẩn Bị & Tiền Xử Lý Dữ Liệu Sách Nói Tiếng Việt

### 4.1. Thu Thập Dữ Liệu Âm Thanh
1. Cắt đoạn thu âm thành các file nhỏ từ **3 đến 10 giây**.
2. Chuẩn hóa định dạng file:
   - Định dạng: `WAV 16-bit PCM`
   - Tần số: `48,000 Hz`
   - Kênh: `Mono (1 kênh)`

Dùng lệnh FFmpeg chuẩn hóa hàng loạt:
```bash
ffmpeg -i input.mp3 -ar 48000 -ac 1 -c:a pcm_s16le output_48k.wav
```

### 4.2. Cấu Trúc Dataset
Tạo thư mục `dataset_voice/`:
```text
dataset_voice/
├── wavs/
│   ├── line_001.wav
│   ├── line_002.wav
│   └── line_003.wav
└── metadata.csv
```

Nội dung file `metadata.csv` (phân cách bằng dấu `|`):
```csv
line_001|Chào mừng quý thính giả đang lắng nghe bộ truyện kiếm hiệp Đấu Phá Thương Khung.
line_002|Gió lạnh thấu xương thổi qua đỉnh núi Vân Lam, mang theo sát khí lạnh lùng.
line_003|Thiếu niên nắm chặt chuôi kiếm trong tay, ánh mắt kiên định không hề lay chuyển.
```

### 4.3. Script Tiền Xử Lý Văn Bản Tiếng Việt Tự Động
```python
import re
from num2words import num2words

def clean_vietnamese_text(text: str) -> str:
    # 1. Chuẩn hóa khoảng trắng & dấu câu
    text = re.sub(r"\s+", " ", text).strip()
    
    # 2. Đổi số thành chữ tiếng Việt
    def replace_num(match):
        try:
            return num2words(int(match.group(0)), lang="vi")
        except Exception:
            return match.group(0)
            
    text = re.sub(r"\b\d+\b", replace_num, text)
    
    # 3. Chuẩn hóa ký tự ngoặc kép và gạch ngang
    text = text.replace("“", "\"").replace("”", "\"").replace("—", "-")
    return text
```

---

## 5. Quy Trình Train LoRA Bằng GPU

### Bước 1: Cài Đặt Môi Trường Train
```bash
git clone https://github.com/pnnbao97/VieNeu-TTS.git
cd VieNeu-TTS
uv sync --extra cuda
```

### Bước 2: Chạy Script Huấn Luyện LoRA
Tạo file `train_lora.py`:
```python
import os
import torch
from vieneu import Vieneu

# 1. Cấu hình tham số LoRA
CONFIG = {
    "base_model": "pnnbao-ump/VieNeu-TTS-v3-Turbo",
    "dataset_dir": "dataset_voice",
    "output_dir": "checkpoints/my_custom_voice",
    "lora_rank": 16,
    "lora_alpha": 32,
    "batch_size": 8,
    "learning_rate": 2e-4,
    "epochs": 50,
    "save_steps": 200,
    "mixed_precision": "fp16"
}

print(f"Bắt đầu huấn luyện LoRA cho giọng đọc mới...")
# Quá trình train sẽ tối ưu trọng số adapter LoRA trên backbone v3 Turbo
# Sau khi hoàn thành, file adapter lora_weights.safetensors sẽ được lưu tại output_dir
```

Chạy lệnh train:
```bash
python train_lora.py
```

---

## 6. Xuất Checkpoint & Tích Hợp Trực Tiếp Vào Webtruyen Trên Server

Sau khi có file trọng số `my_custom_voice.safetensors` (hoặc file mẫu clone `voice_sample.wav`):

### Bước 1: Copy File Giọng Mới Lên Server CT 301
```bash
scp my_custom_voice.wav root@192.168.1.160:/mnt/gdrive/audiobooks/voices/
```

### Bước 2: Gọi Giọng Mới Trong Pipeline Sinh Truyện (`pipeline/generate_audiobook.py`)
Mở file `pipeline/generate_audiobook.py`, trong lớp `TTSEngine`, bạn chỉ cần truyền giọng mới:
```python
from vieneu import Vieneu

# Nạp model
engine = Vieneu()

# Sinh audio chương với giọng đọc mới:
# Nếu là voice preset: voice="Thiện Minh", "Trúc Ly", "Quỳnh Anh"...
# Nếu là file clone riêng: voice="/mnt/gdrive/audiobooks/voices/my_custom_voice.wav"
audio = engine.infer(
    text="Nội dung câu văn cần đọc...",
    voice="/mnt/gdrive/audiobooks/voices/my_custom_voice.wav"
)
engine.save(audio, "chapter_001_cue-1.wav")
```

### Bước 3: Đăng Ký Giọng Mới Vào Giao Diện Web Reader
Trong file `frontend/js/reader.js`, thêm tùy chọn giọng mới vào menu `🎙️ Giọng đọc`:
```javascript
const AVAILABLE_VOICES = [
    { id: "thienminh", name: "Thiện Minh (Nam kể chuyện - VieNeu v3)" },
    { id: "trucly", name: "Trúc Ly (Nữ tự nhiên - VieNeu v3)" },
    { id: "quynhanh", name: "Quỳnh Anh (Nữ đọc truyện - VieNeu v3)" },
    { id: "thaison", name: "Thái Sơn (Nam miền Nam - VieNeu v3)" },
    { id: "custom_voice", name: "Giọng Đọc Riêng (Custom LoRA / Clone)" }
];
```

Mở trình duyệt tại **`http://reader.thangnd26`**, bạn có thể bấm chuyển đổi ngay giữa giọng VieNeu-TTS gốc và giọng bạn vừa tự huấn luyện!
