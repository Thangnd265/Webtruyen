# 🎙️ Hướng Dẫn Huấn Luyện Mô Hình Text-To-Speech (TTS) Tiếng Việt Cho Sách Nói & Truyện Chữ

Tài liệu này cung cấp hướng dẫn toàn diện từ A-Z để tự huấn luyện (train / fine-tune) mô hình chuyển đổi văn bản thành giọng nói (Text-To-Speech - TTS) tiếng Việt chuyên dụng cho hệ thống đọc truyện **Webtruyenv2**.

---

## 📑 Mục Lục
1. [Tổng Quan Kiến Trúc TTS & Hệ Thống Webtruyenv2](#1-tổng-quan-kiến-trúc-tts--hệ-thống-webtruyenv2)
2. [Lựa Chọn Kiến Trúc Mô Hình](#2-lựa-chọn-kiến-trúc-mô-hình)
3. [Chuẩn Bị & Thu Thập Dữ Liệu (Dataset)](#3-chuẩn-bị--thu-thập-dữ-liệu-dataset)
4. [Tiền Xử Lý Dữ Liệu Tiếng Việt](#4-tiền-xử-lý-dữ-liệu-tiếng-việt)
5. [Cấu Hình & Tiến Trình Huấn Luyện (Training)](#5-cấu-hình--tiến-trình-huấn-luyện-training)
6. [Đánh Giá & Xuất Mô Hình (Inference & Export)](#6-đánh-giá--xuất-mô-hình-inference--export)
7. [Tích Hợp Vào Pipeline Webtruyenv2 (Sinh Audio + Cues.json)](#7-tích-hợp-vào-pipeline-webtruyenv2-sinh-audio--cuesjson)

---

## 1. Tổng Quan Kiến Trúc TTS & Hệ Thống Webtruyenv2

Trong hệ thống **Webtruyenv2**, tính năng quan trọng nhất là **đồng bộ Karaoke thời gian thực**.
Để đạt được điều này mà không làm nghẽn CPU/GPU khi chạy Whisper forced-alignment, pipeline sinh audio của Webtruyenv2 sử dụng cơ chế:
1. **Tách câu thông minh (`text_splitter.py`)**: Tách văn bản truyện thành từng câu độc lập có gán mã `cue-1`, `cue-2`...
2. **Inference theo từng câu**: Mô hình TTS đọc từng câu và xuất ra buffer WAV trong RAM (`/dev/shm`).
3. **Đo thời lượng sóng âm chính xác**: Xác định `start` và `end` thời gian của từng câu bằng độ dài thực tế của file âm thanh:
   $$\text{start}_{i} = \text{duration}_{\text{accumulated}}$$
   $$\text{end}_{i} = \text{start}_{i} + \text{duration}(\text{chunk}_{i})$$
4. **Ghép nối bằng FFmpeg**: Nối toàn bộ các câu thành 1 file chương duy nhất (`chapter_001.m4b`) và xuất file tọa độ (`chapter_001_cues.json`).

Vì vậy, mô hình TTS cần đáp ứng:
- **Tốc độ sinh nhanh (RTF < 0.2)**: Có thể sinh hàng trăm câu trong vài giây.
- **Giọng đọc tự nhiên, diễn cảm, chuẩn dấu thanh tiếng Việt** (hỏi, ngã, nặng, sắc, huyền).
- **Độ ổn định cao**: Không bị nuốt từ, không bị lặp âm (hallucination).

---

## 2. Lựa Chọn Kiến Trúc Mô Hình

Đối với tiếng Việt, 3 kiến trúc phù hợp và hiệu quả nhất hiện nay gồm:

| Kiến trúc | Ưu điểm | Nhược điểm | Khuyến nghị cấu hình phần cứng |
|---|---|---|---|
| **VITS / VITS2** (Variational Inference with adversarial learning) | Tốc độ cực nhanh (Inference realtime trên CPU), âm thanh trong trẻo, không bị trượt âm | Cần nhiều dữ liệu của 1 người nói (5-20 giờ) | GPU RTX 3060 12GB trở lên |
| **VieNeu-TTS / F5-TTS** (Flow-Matching Architecture) | Giọng đọc truyền cảm, ngắt nghỉ cực tự nhiên, biểu cảm truyện kiếm hiệp/ngôn tình rất tốt | Tốn tài nguyên inference hơn VITS một chút | GPU RTX 3090 / 4090 (24GB VRAM) |
| **XTTS-v2** (Zero-shot Voice Cloning) | Chỉ cần 10-30 giây giọng mẫu là clone được giọng đọc bất kỳ | Dễ bị trượt phát âm dấu ngã/hỏi nếu prompt tiếng Việt ngắn | GPU RTX 3080/4080 (16GB VRAM) |

> 💡 **Khuyến nghị cho Webtruyenv2:** Dùng **VITS tiếng Việt** hoặc **VieNeu-TTS** để có chất lượng giọng đọc sách nói ổn định và tốc độ cao nhất.

---

## 3. Chuẩn Bị & Thu Thập Dữ Liệu (Dataset)

### 3.1. Tiêu Chuẩn File Âm Thanh
- **Định dạng**: WAV 16-bit PCM, Mono channel (1 kênh).
- **Tần số lấy mẫu (Sample Rate)**: **24,000 Hz** (hoặc 22,050 Hz / 44,100 Hz tùy vocoder).
- **Độ dài mỗi mẫu (Duration)**: **2 đến 12 giây** (lý tưởng nhất là 3 - 8 giây).
- **Mức độ ồn nền (Noise)**: Yên tĩnh tuyệt đối (< -45dB noise floor), không có tiếng vang (reverb).
- **Dung lượng dataset tối thiểu**:
  - Fine-tune: 2 - 5 giờ âm thanh chất lượng cao (khoảng 1.500 - 4.000 file câu).
  - Train from scratch: 15 - 30 giờ âm thanh.

### 3.2. Cấu Trúc Dataset
Tổ chức thư mục dữ liệu theo định dạng chuẩn LJSpeech:
```text
dataset_tts_vietnamese/
├── wavs/
│   ├── line_000001.wav
│   ├── line_000002.wav
│   └── line_000003.wav
└── metadata.csv
```

File `metadata.csv` sử dụng định dạng phân tách bằng dấu gạch đứng `|`:
```csv
line_000001|Đêm nay trăng thanh gió mát, Tiêu Viêm ngồi xếp bằng trên đỉnh núi.|Đêm nay trăng thanh gió mát, Tiêu Viêm ngồi xếp bằng trên đỉnh núi.
line_000002|Hắn hít sâu một hơi khí lạnh, cảm nhận đấu khí đang lưu chuyển trong kinh mạch.|Hắn hít sâu một hơi khí lạnh, cảm nhận đấu khí đang lưu chuyển trong kinh mạch.
line_000003|Bỗng nhiên, một giọng nói già nua vang lên từ chiếc nhẫn màu đen.|Bỗng nhiên, một giọng nói già nua vang lên từ chiếc nhẫn màu đen.
```

---

## 4. Tiền Xử Lý Dữ Liệu Tiếng Việt

Tiếng Việt là ngôn ngữ đơn âm tiết có thanh điệu (6 thanh: ngang, huyền, sắc, hỏi, ngã, nặng). Khâu tiền xử lý (Text Normalization & G2P) quyết định 60% chất lượng giọng đọc.

### 4.1. Text Normalization (Chuẩn Hóa Văn Bản)
Tất cả các số, ngày tháng, từ viết tắt và ký tự ngoại lai cần được chuyển thành chữ phát âm tiếng Việt:
- `100` -> `một trăm`
- `25/08` -> `hai mươi lăm tháng tám`
- `km/h` -> `ki-lô-mét trên giờ`
- `&` -> `và`

Ví dụ script chuẩn hóa Python:
```python
import re
from num2words import num2words

def normalize_vietnamese_text(text: str) -> str:
    # 1. Chuẩn hóa khoảng trắng & dấu câu
    text = re.sub(r"\s+", " ", text).strip()
    
    # 2. Thay thế số thành chữ
    def replace_num(match):
        num_str = match.group(0)
        try:
            return num2words(int(num_str), lang="vi")
        except Exception:
            return num_str
            
    text = re.sub(r"\b\d+\b", replace_num, text)
    
    # 3. Chuẩn hóa dấu ngoặc kép / gạch đầu dòng
    text = text.replace("“", "\"").replace("”", "\"").replace("—", "-")
    return text
```

### 4.2. Grapheme-to-Phoneme (G2P) Cho Tiếng Việt
Sử dụng thư viện `vietnamese-phonemizer` hoặc bảng chữ cái IPA tiếng Việt để mô hình học chính xác thanh điệu:
```bash
pip install vinorm g2p-vi
```

---

## 5. Cấu Hình & Tiến Trình Huấn Luyện (Training)

### 5.1. Sử Dụng Bộ Công Cụ Coqui TTS (VITS Architecture)

1. **Cài đặt môi trường:**
   ```bash
   conda create -n tts-train python=3.10 -y
   conda activate tts-train
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
   pip install TTS
   ```

2. **File cấu hình huấn luyện `train_vits_vi.py`:**
   ```python
   import os
   from trainer import Trainer, TrainerArgs
   from TTS.tts.configs.shared_configs import BaseDatasetConfig
   from TTS.tts.configs.vits_config import VitsConfig
   from TTS.tts.datasets import load_tts_samples
   from TTS.tts.models.vits import Vits, VitsAudioConfig

   # Cấu hình âm thanh
   audio_config = VitsAudioConfig(
       sample_rate=24000,
       win_length=1024,
       hop_length=256,
       num_mels=80,
       mel_fmin=0,
       mel_fmax=None,
   )

   # Cấu hình dataset
   dataset_config = BaseDatasetConfig(
       formatter="ljspeech",
       dataset_name="vietnamese_audiobook",
       path="dataset_tts_vietnamese/",
       meta_file_train="metadata.csv",
   )

   # Cấu hình kiến trúc VITS
   config = VitsConfig(
       audio=audio_config,
       run_name="vits_vietnamese_reader",
       batch_size=16,
       eval_batch_size=8,
       num_loader_workers=4,
       num_eval_loader_workers=2,
       run_eval=True,
       test_delay_epochs=-1,
       epochs=1000,
       text_cleaner="multilingual_cleaners",
       use_phonemes=False, # Hoặc True nếu đã phonemize
       characters="aáàảãạâấầẩẫậăắằẳẵặeéèẻẽẹêếềểễệiíìỉĩịoóòỏõọôốồổỗộơớờởỡợuúùủũụưứừửữựyýỳỷỹỵbcdfghjklmnpqrstvwxz -.,?!",
       save_step=2000,
       print_step=50,
       mixed_precision=True, # Bật FP16 tăng tốc độ gấp 2 lần trên card NVIDIA
       output_path="checkpoints/",
       datasets=[dataset_config],
   )

   # Tải mẫu
   train_samples, eval_samples = load_tts_samples(dataset_config, eval_split=True)

   # Khởi tạo mô hình
   model = Vits(config)

   # Khởi chạy Trainer
   trainer = Trainer(
       TrainerArgs(),
       config,
       output_path="checkpoints/",
       model=model,
       train_samples=train_samples,
       eval_samples=eval_samples,
   )
   trainer.fit()
   ```

3. **Bắt đầu Train:**
   ```bash
   python train_vits_vi.py
   ```

4. **Theo dõi Loss trên TensorBoard:**
   ```bash
   tensorboard --logdir checkpoints/
   ```
   *Theo dõi các giá trị loss quan trọng:*
   - `loss_gen` (Generator loss): Giảm dần và hội tụ quanh mức 20 - 25.
   - `loss_disc` (Discriminator loss): Dao động ổn định quanh mức 2 - 4.
   - `loss_mel`: Đo độ sai lệch quang phổ âm thanh, cần giảm liên tục xuống dưới 0.4.

---

## 6. Đánh Giá & Xuất Mô Hình (Inference & Export)

Sau khoảng 100k - 200k steps (khoảng 8 - 16 tiếng trên RTX 3090):
1. **Lấy file checkpoint tốt nhất:**
   - Model weights: `checkpoints/vits_vietnamese_reader-.../best_model.pth`
   - Config JSON: `checkpoints/vits_vietnamese_reader-.../config.json`

2. **Chạy thử nghiệm giọng đọc đơn lẻ:**
   ```python
   from TTS.api import TTS

   tts = TTS(
       model_path="checkpoints/best_model.pth",
       config_path="checkpoints/config.json",
       gpu=True
   )

   tts.tts_to_file(
       text="Chào mừng các bạn độc giả đã đến với trang đọc truyện Tiểu Thuyết Mạng!",
       file_path="test_output.wav"
   )
   ```

3. **Xuất mô hình tối ưu sang ONNX để tăng tốc độ inference:**
   ```bash
   python -m TTS.bin.export_onnx --model_path checkpoints/best_model.pth --config_path checkpoints/config.json --output_path model_vietnamese.onnx
   ```

---

## 7. Tích Hợp Vào Pipeline Webtruyenv2 (Sinh Audio + Cues.json)

Khi đã có model mới, bạn tích hợp trực tiếp vào worker `pipeline/generate_audiobook.py` để tự động hóa toàn bộ quá trình đọc sách:

### 7.1. Chỉnh Sửa Worker Sinh Audio (`pipeline/generate_audiobook.py`)

Thêm hàm khởi tạo model và synthesize câu:
```python
import wave
from pathlib import Path

# Khởi tạo mô hình TTS một lần duy nhất trong bộ nhớ RAM
from TTS.api import TTS
custom_tts_model = TTS(model_path="models/best_model.pth", config_path="models/config.json", gpu=True)

def synthesize_sentence(text: str, output_wav_path: Path) -> float:
    """Sinh audio cho 1 câu văn bản và trả về thời lượng chính xác tính bằng giây."""
    custom_tts_model.tts_to_file(text=text, file_path=str(output_wav_path))
    
    # Đọc thời lượng từ header file WAV mà không cần load toàn bộ mảng numpy
    with wave.open(str(output_wav_path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        duration = frames / float(rate)
    return duration
```

### 7.2. Chạy Pipeline Sinh Truyện Đầy Đủ
Lệnh sinh tự động truyện từ file EPUB:
```bash
python pipeline/generate_audiobook.py \
  --epub "truyen_chu_tien_hiep.epub" \
  --slug "tien-nghich" \
  --output-dir "/mnt/gdrive/audiobooks/tien-nghich" \
  --ram-dir "/dev/shm"
```

Pipeline sẽ tự động:
1. Đọc từng chương trong EPUB theo đúng thứ tự tác giả.
2. Tách thành các đoạn văn và câu thoại với ID `cue-1`, `cue-2`...
3. Gọi mô hình TTS sinh từng câu trực tiếp vào RAM Disk `/dev/shm`.
4. Tính toán tọa độ thời gian `cues.json` chính xác tuyệt đối.
5. Ghép nối thành file `.m4b` qua FFmpeg.
6. Xóa sạch file tạm trong RAM ngay lập tức và ghi kết quả lên Google Drive.
7. Mở trình duyệt tại `http://reader.thangnd26` là có thể nghe ngay lập tức với đầy đủ hiệu ứng Karaoke!
