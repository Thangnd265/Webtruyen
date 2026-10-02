"""Distributed GPU Render Worker for Webtruyenv2.

Runs on local PC with NVIDIA RTX 5060 GPU to offload heavy TTS synthesis from server.
Reads/writes directly to G:\\My Drive\\Audiobooks via Google Drive Desktop sync.
Streams sentence-by-sentence progress back to Server coordinator at http://192.168.1.160:3080.
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pc_worker")

# Setup project root path
worker_dir = Path(__file__).resolve().parent
project_root = worker_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


def get_gpu_info() -> Dict[str, Any]:
    """Detects CUDA availability and GPU specs using PyTorch."""
    try:
        import torch

        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram_bytes = torch.cuda.get_device_properties(0).total_memory
            vram_gb = round(vram_bytes / (1024**3), 1)
            return {
                "available": True,
                "name": gpu_name,
                "vram_gb": vram_gb,
            }
    except Exception as e:
        logger.warning(f"Error querying PyTorch CUDA: {e}")

    return {
        "available": False,
        "name": "CPU Only",
        "vram_gb": 0.0,
    }


def find_default_audiobooks_dir() -> Path:
    """Finds Google Drive Audiobooks directory on Windows or fallback."""
    candidates = [
        Path("G:/My Drive/Audiobooks"),
        Path("G:/Shared drives/Audiobooks"),
        Path("D:/Audiobooks"),
        project_root / "audiobooks",
    ]
    for p in candidates:
        if p.exists() and p.is_dir():
            return p
    # Fallback to G: drive default even if not yet populated
    return Path("G:/My Drive/Audiobooks")


def http_post(url: str, data: Dict[str, Any], timeout: float = 8.0) -> Optional[Dict[str, Any]]:
    """Simple stdlib HTTP POST returning JSON."""
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Webtruyen-PC-Worker/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.URLError as e:
        logger.debug(f"HTTP request error to {url}: {e}")
        return None
    except Exception as e:
        logger.debug(f"Unexpected error posting to {url}: {e}")
        return None


def find_local_source_file(audiobooks_dir: Path, source_filename: Optional[str], book_slug: str) -> Optional[Path]:
    """Finds the source text or epub file on the local shared storage."""
    candidates_dirs = [
        audiobooks_dir / "incoming_books",
        audiobooks_dir / "incoming_books" / "done",
        audiobooks_dir / book_slug,
        project_root / "incoming_books",
    ]

    # 1. Exact filename from server
    if source_filename:
        for d in candidates_dirs:
            p = d / source_filename
            if p.is_file():
                return p
            # Search in done/
            done_cand = d / "done" / source_filename
            if done_cand.is_file():
                return done_cand

    # 2. Match with slug
    extensions = [".epub", ".txt", ".mobi", ".pdf", ".docx", ".fb2", ".prc", ".azw", ".azw3"]
    for d in candidates_dirs:
        if not d.is_dir():
            continue
        for ext in extensions:
            target = d / f"{book_slug}{ext}"
            if target.is_file():
                return target

    # 3. Substring match in incoming_books
    slug_clean = book_slug.lower().replace("_", "-").replace(" ", "-")
    slug_tokens = set(t for t in slug_clean.split("-") if len(t) > 2 and t not in {"con", "duong", "de", "vuong", "full", "tap", "the", "book"})

    for d in candidates_dirs:
        if not d.is_dir():
            continue
        for ext in extensions:
            for f in d.glob(f"*{ext}"):
                f_stem = f.stem.lower().replace("_", "-").replace(" ", "-")
                if f_stem in slug_clean or slug_clean in f_stem:
                    return f
                f_tokens = set(t for t in f_stem.split("-") if len(t) > 2)
                if len(slug_tokens.intersection(f_tokens)) >= 2:
                    return f

    return None


class PCGPUWorker:
    def __init__(
        self,
        server_url: str = "http://192.168.1.160:3080",
        audiobooks_dir: Optional[Path] = None,
        poll_interval: float = 4.0,
    ):
        self.server_url = server_url.rstrip("/")
        self.audiobooks_dir = audiobooks_dir or find_default_audiobooks_dir()
        self.poll_interval = poll_interval
        self.worker_name = socket.gethostname()
        self.gpu_info = get_gpu_info()
        self.running = True
        self.current_process: Optional[subprocess.Popen] = None
        self.status = "idle"

    def print_banner(self):
        vram_str = f"{self.gpu_info['vram_gb']} GB VRAM" if self.gpu_info["available"] else "N/A"
        cuda_badge = "🟢 CUDA SẴN SÀNG" if self.gpu_info["available"] else "⚠️ KHÔNG CÓ CUDA"

        print("\n" + "=" * 64)
        print("  🚀 WEBTUYEN DISTRIBUTED GPU RENDER WORKER")
        print("=" * 64)
        print(f"  🖥️  Server URL:       {self.server_url}")
        print(f"  🎮 GPU Device:       {self.gpu_info['name']} ({vram_str}) [{cuda_badge}]")
        print(f"  📂 Shared Storage:   {self.audiobooks_dir}")
        print(f"  ⚡ Model:            VieNeu-TTS v3 Turbo + English Pronunciation Tuner")
        print(f"  💻 Host Name:        {self.worker_name}")
        print("=" * 64 + "\n")

    def run(self):
        self.print_banner()
        logger.info(f"Worker đã khởi động. Đang kết nối tới Server {self.server_url}...")

        last_heartbeat_time = 0.0

        while self.running:
            try:
                now = time.time()
                # 1. Send Heartbeat every 5 seconds
                if now - last_heartbeat_time >= 5.0:
                    hb_data = {
                        "worker_name": self.worker_name,
                        "gpu_name": self.gpu_info["name"],
                        "vram_gb": self.gpu_info["vram_gb"],
                        "status": self.status,
                    }
                    res = http_post(f"{self.server_url}/api/worker/heartbeat", hb_data)
                    last_heartbeat_time = now

                    if res and res.get("status") == "ok":
                        if res.get("has_job") and self.status == "idle":
                            # Poll job immediately
                            self.poll_and_execute_job()
                    elif res is None:
                        logger.warning(f"Không thể kết nối tới Server tại {self.server_url}. Sẽ thử lại sau...")

                time.sleep(self.poll_interval)

            except KeyboardInterrupt:
                logger.info("🛑 Đã nhận tín hiệu dừng (Ctrl+C). Đang tắt worker...")
                self.stop()
                break
            except Exception as e:
                logger.error(f"Lỗi worker loop: {e}")
                time.sleep(self.poll_interval)

    def poll_and_execute_job(self):
        """Polls server for the next job and renders it using local GPU."""
        poll_res = http_post(f"{self.server_url}/api/worker/poll-job", {})
        if not poll_res or not poll_res.get("job"):
            return

        job = poll_res["job"]
        book_slug = job["book_slug"]
        book_title = job.get("book_title", book_slug)
        start_ch = job.get("start_ch", 1)
        max_ch = job.get("max_ch", 50)
        voice = job.get("voice", "Ngọc Huyền")
        source_filename = job.get("source_filename")

        self.status = "rendering"
        logger.info(
            f"📥 [NHẬN TÁC VỤ] '{book_title}' (Slug: {book_slug}) | Chương {start_ch} -> {start_ch + max_ch - 1} | Giọng: {voice}"
        )

        source_file = find_local_source_file(self.audiobooks_dir, source_filename, book_slug)
        if not source_file:
            err_msg = (
                f"Không tìm thấy file truyện nguồn cho '{book_title}' tại {self.audiobooks_dir / 'incoming_books'}."
            )
            logger.error(f"❌ {err_msg}")
            http_post(
                f"{self.server_url}/api/worker/complete",
                {"book_slug": book_slug, "success": False, "error_msg": err_msg},
            )
            self.status = "idle"
            return

        logger.info(f"📖 File gốc tìm thấy: {source_file}")

        # Execute generate_audiobook.py in subprocess with Python CUDA
        gen_script = project_root / "pipeline" / "generate_audiobook.py"
        cmd = [
            sys.executable,
            "-u",
            str(gen_script),
            str(source_file),
            "--slug", book_slug,
            "--title", book_title,
            "--output-dir", str(self.audiobooks_dir),
            "--voice", voice,
            "--start-chapter", str(start_ch),
            "--max-chapters", str(max_ch),
            "--bitrate", "64k",
        ]

        logger.info(f"⚡ Bắt đầu render trên NVIDIA RTX 5060...")
        start_time = time.time()
        ch_processed = 0
        lines_output: List[str] = []
        is_cancelled = False

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            self.current_process = process

            for line in iter(process.stdout.readline, ""):
                if not line:
                    break
                line_str = line.strip()
                lines_output.append(line_str)

                # Check if server requested cancellation
                # Parse sentence-level progress: PROGRESS:<chapter_id>:<current>:<total>:<pct>
                if "PROGRESS:" in line_str:
                    try:
                        p_part = line_str[line_str.index("PROGRESS:") :]
                        parts = p_part.split(":")
                        ch_id = parts[1]
                        cur_s = int(parts[2])
                        tot_s = int(parts[3])
                        pct_s = float(parts[4])

                        ch_fraction = cur_s / max(1, tot_s)
                        overall_pct = min(99, int(((ch_processed + ch_fraction) / max(1, max_ch)) * 100))

                        elapsed = time.time() - start_time
                        eta_seconds = None
                        if cur_s > 0 and elapsed > 0:
                            total_est = max_ch * tot_s
                            done_s = ch_processed * tot_s + cur_s
                            speed = done_s / elapsed
                            if speed > 0:
                                rem = max(0, total_est - done_s)
                                eta_seconds = int(rem / speed)

                        msg = f"RTX 5060 đang tổng hợp {ch_id}: câu {cur_s}/{tot_s} ({pct_s:.1f}%)"
                        logger.info(f"[{overall_pct}%] {msg}")

                        # Stream progress to server
                        prog_res = http_post(
                            f"{self.server_url}/api/worker/progress",
                            {
                                "book_slug": book_slug,
                                "current_chapter": start_ch + ch_processed,
                                "total_chapters": max_ch,
                                "current_sentence": cur_s,
                                "total_sentences": tot_s,
                                "percent": overall_pct,
                                "eta_seconds": eta_seconds,
                                "message": msg,
                            },
                        )

                        if prog_res and prog_res.get("cancelled"):
                            logger.warning("🛑 Server yêu cầu HỦY tác vụ render!")
                            is_cancelled = True
                            process.terminate()
                            break

                    except Exception as parse_err:
                        logger.debug(f"Progress parse error: {parse_err}")

                elif "Successfully processed" in line_str:
                    ch_processed += 1
                    logger.info(f"✅ Hoàn tất chương {start_ch + ch_processed - 1} thành công!")
                    # Instantly push chapter text and cues to Server local SSD
                    try:
                        m_ch = re.search(r"chapter_\d+", line_str)
                        if m_ch:
                            ch_done_id = m_ch.group(0)
                            book_folder = self.audiobooks_dir / book_slug
                            html_file = book_folder / f"{ch_done_id}.html"
                            cues_file = book_folder / f"{ch_done_id}_cues.json"
                            meta_file = book_folder / "metadata.json"

                            ch_title = None
                            m_num = re.search(r"\d+", ch_done_id)
                            ch_index = int(m_num.group(0)) if m_num else (start_ch + ch_processed - 1)

                            if meta_file.is_file():
                                try:
                                    meta_data = json.loads(meta_file.read_text(encoding="utf-8"))
                                    for ch_item in meta_data.get("chapters", []):
                                        if ch_item.get("id") == ch_done_id:
                                            ch_title = ch_item.get("title")
                                            if ch_item.get("chapter_index"):
                                                ch_index = ch_item.get("chapter_index")
                                            break
                                except Exception:
                                    pass

                            if html_file.is_file():
                                html_txt = html_file.read_text(encoding="utf-8")
                                cues_data = json.loads(cues_file.read_text(encoding="utf-8")) if cues_file.is_file() else None
                                http_post(
                                    f"{self.server_url}/api/worker/upload-chapter",
                                    {
                                        "book_slug": book_slug,
                                        "chapter_id": ch_done_id,
                                        "chapter_index": ch_index,
                                        "title": ch_title,
                                        "html": html_txt,
                                        "cues": cues_data,
                                    },
                                )
                                logger.info(f"⚡ Đã đồng bộ text {ch_done_id} ('{ch_title or f'Chương {ch_index}'}') lên SSD server (Đọc tức thì)!")
                    except Exception as upload_err:
                        logger.debug(f"Could not push chapter text to server: {upload_err}")

            process.wait()

            if is_cancelled:
                logger.info(f"🛑 Đã dừng render tác vụ '{book_title}'.")
            elif process.returncode == 0:
                elapsed_min = round((time.time() - start_time) / 60, 1)
                logger.info(
                    f"🎉 [HOÀN TẤT] Đã render xong {ch_processed} chương cho '{book_title}' trong {elapsed_min} phút!"
                )
                http_post(
                    f"{self.server_url}/api/worker/complete",
                    {
                        "book_slug": book_slug,
                        "success": True,
                        "chapters_done": ch_processed,
                    },
                )
            else:
                tail_err = "\n".join(lines_output[-5:])
                logger.error(f"❌ Tiến trình render bị lỗi (Mã {process.returncode}):\n{tail_err}")
                http_post(
                    f"{self.server_url}/api/worker/complete",
                    {
                        "book_slug": book_slug,
                        "success": False,
                        "error_msg": tail_err,
                    },
                )

        except Exception as exc:
            logger.error(f"Ngoại lệ khi thực thi render: {exc}")
            http_post(
                f"{self.server_url}/api/worker/complete",
                {
                    "book_slug": book_slug,
                    "success": False,
                    "error_msg": str(exc),
                },
            )
        finally:
            self.current_process = None
            self.status = "idle"

    def stop(self):
        self.running = False
        if self.current_process and self.current_process.poll() is None:
            try:
                self.current_process.terminate()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Webtruyen PC GPU Render Worker")
    parser.add_argument(
        "--server-url",
        type=str,
        default=os.getenv("SERVER_URL", "http://192.168.1.160:3080"),
        help="Webtruyen Server API URL (default: http://192.168.1.160:3080)",
    )
    parser.add_argument(
        "--audiobooks-dir",
        type=str,
        default=os.getenv("AUDIOBOOKS_DIR", None),
        help="Shared Audiobooks directory (default: G:\\My Drive\\Audiobooks)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=4.0,
        help="Polling interval in seconds (default: 4.0)",
    )

    args = parser.parse_args()

    audiobooks_dir = Path(args.audiobooks_dir) if args.audiobooks_dir else None
    worker = PCGPUWorker(
        server_url=args.server_url,
        audiobooks_dir=audiobooks_dir,
        poll_interval=args.poll_interval,
    )
    worker.run()


if __name__ == "__main__":
    main()
