import json
import sys
from pathlib import Path

def main():
    token_file = Path("/tmp/gdrive_token.json")
    if not token_file.exists():
        print("Token file not found")
        sys.exit(1)

    with open(token_file, "r", encoding="utf-8") as f:
        d = json.load(f)

    conf_path = Path("/root/.config/rclone/rclone.conf")
    conf_content = f"""[gdrive]
type = drive
client_id = {d["client_id"]}
client_secret = {d["client_secret"]}
scope = drive
token = {d["token"]}
team_drive = 
"""
    conf_path.parent.mkdir(parents=True, exist_ok=True)
    conf_path.write_text(conf_content, encoding="utf-8")
    print("SUCCESS: rclone.conf updated with dedicated Client ID!")

if __name__ == "__main__":
    main()
