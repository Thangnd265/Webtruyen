import os
from pathlib import Path

class Settings:
    @property
    def AUDIOBOOKS_DIR(self) -> str:
        return os.environ.get("AUDIOBOOKS_DIR", "/mnt/gdrive/audiobooks")

    @AUDIOBOOKS_DIR.setter
    def AUDIOBOOKS_DIR(self, value: str):
        os.environ["AUDIOBOOKS_DIR"] = value

    @property
    def KOSYNC_URL(self) -> str:
        return os.environ.get("KOSYNC_URL", "http://192.168.1.103:8085")

    @KOSYNC_URL.setter
    def KOSYNC_URL(self, value: str):
        os.environ["KOSYNC_URL"] = value

    @property
    def KOSYNC_USER(self) -> str:
        return os.environ.get("KOSYNC_USER", "Gudian")

    @KOSYNC_USER.setter
    def KOSYNC_USER(self, value: str):
        os.environ["KOSYNC_USER"] = value

    @property
    def KOSYNC_KEY(self) -> str:
        return os.environ.get("KOSYNC_KEY", "")

    @KOSYNC_KEY.setter
    def KOSYNC_KEY(self, value: str):
        os.environ["KOSYNC_KEY"] = value

    @property
    def PORT(self) -> int:
        return int(os.environ.get("PORT", "3080"))

    @property
    def HOST(self) -> str:
        return os.environ.get("HOST", "0.0.0.0")

settings = Settings()
