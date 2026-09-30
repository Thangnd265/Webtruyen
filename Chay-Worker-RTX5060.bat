@echo off
chcp 65001 > nul
title Webtruyen GPU Worker - NVIDIA RTX 5060
color 0B

echo ====================================================================
echo      🚀 WEBTUYEN GPU WORKER - RENDER TTS TRÊN NVIDIA RTX 5060
echo ====================================================================
echo.
echo  [1] Server URL:        http://192.168.1.160:3080
echo  [2] Card đo hoa:       NVIDIA GeForce RTX 5060 (8GB VRAM)
echo  [3] Google Drive:      G:\My Drive\Audiobooks
echo  [4] VieNeu Engine:     v3 Turbo + Bo chuan hoa tieng Anh
echo.
echo  * Luu y: Giu cua so nay mo khi muon may tinh nhan render tu dong.
echo  * Nhan Ctrl+C de dung Worker bat ky luc nao.
echo ====================================================================
echo.

cd /d "%~dp0"
python worker\pc_worker.py

if errorlevel 1 (
    echo.
    echo [CANH BAO] Worker da ket thuc voi ma loi.
    pause
)
