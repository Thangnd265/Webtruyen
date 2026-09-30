import json
from pathlib import Path
import sys
from pipeline.universal_extractor import extract_book_chapters

def main():
    meta_path = Path("/mnt/gdrive/audiobooks/tu-da-quai-bat-dau-tien-hoa-thang-cap-full/metadata.json")
    prc_path = Path("/mnt/gdrive/audiobooks/incoming_books/Tu da quai bat dau tien hoa thang cap FULL.prc")

    if not meta_path.exists() or not prc_path.exists():
        print(f"Paths not found: meta={meta_path.exists()} prc={prc_path.exists()}")
        sys.exit(1)

    print("Extracting clean text from PRC...")
    meta, chs = extract_book_chapters(prc_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    clean_titles = {c["id"]: c["title"] for c in chs}
    for ch in data.get("chapters", []):
        if ch["id"] in clean_titles:
            ch["title"] = clean_titles[ch["id"]]

    if meta.get("title"):
        data["title"] = meta["title"]

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("SUCCESS! Sample Ch 1:", data["chapters"][0]["title"])

if __name__ == "__main__":
    main()
