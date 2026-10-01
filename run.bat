@echo off
cd /d "%~dp0"
set AUDIOBOOKS_DIR=%~dp0audiobooks
set PORT=3080
echo ==================================================
echo   Webtruyen Local Server dang chay tai:
echo   http://localhost:3080
echo ==================================================
if exist "%~dp0.py312\python.exe" (
    "%~dp0.py312\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 3080 --reload
) else (
    python -m uvicorn backend.main:app --host 0.0.0.0 --port 3080 --reload
)
pause
