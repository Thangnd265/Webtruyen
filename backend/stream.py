import os
from typing import Generator
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

def range_streamer(file_path: str, range_header: str | None) -> StreamingResponse:
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Audio file not found")
        file_size = os.path.getsize(file_path)
    except OSError:
        raise HTTPException(status_code=503, detail="Storage temporarily unavailable")
    
    content_type = "audio/mp4" if file_path.endswith((".m4b", ".mp4", ".m4a")) else "audio/mpeg"
    
    if not range_header:
        def full_iter() -> Generator[bytes, None, None]:
            try:
                with open(file_path, "rb") as f:
                    while chunk := f.read(64 * 1024):
                        yield chunk
            except OSError:
                return
        return StreamingResponse(
            full_iter(),
            status_code=200,
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Content-Type": content_type
            }
        )

    try:
        if not range_header.startswith("bytes="):
            raise HTTPException(status_code=416, detail="Requested range not satisfiable")

        range_val = range_header.replace("bytes=", "").strip()
        parts = range_val.split("-")
        if len(parts) != 2:
            raise HTTPException(status_code=416, detail="Requested range not satisfiable")

        if not parts[0] and parts[1]:
            # RFC 7233 Suffix range (e.g. bytes=-500 -> last 500 bytes)
            suffix_len = int(parts[1])
            if suffix_len <= 0 or file_size == 0:
                raise HTTPException(status_code=416, detail="Requested range not satisfiable")
            start = max(0, file_size - suffix_len)
            end = file_size - 1
        else:
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1

        if start >= file_size or end >= file_size or start > end:
            raise HTTPException(status_code=416, detail="Requested range not satisfiable")
    except (ValueError, IndexError):
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")
    
    chunk_len = (end - start) + 1
    
    def range_iter() -> Generator[bytes, None, None]:
        try:
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = chunk_len
                while remaining > 0:
                    read_size = min(64 * 1024, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
        except OSError:
            return

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_len),
        "Content-Type": content_type
    }
    return StreamingResponse(range_iter(), status_code=206, headers=headers)
