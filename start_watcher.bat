@echo off
chcp 65001 > nul
title Webtruyenv2 - Auto Folder Watcher (AI Audiobook)
echo ========================================================
echo   Webtruyenv2 - Tiến trình tự động chuyển sách thành Audio
echo ========================================================
echo.
echo Thư mục giám sát: incoming_books\
echo Thư mục xuất bản: samples\ (Web Reader)
echo.
echo Đang chạy watcher... Hãy để cửa sổ này mở khi bạn muốn
echo hệ thống tự động biên dịch khi thả file vào incoming_books!
echo.
echo Nhấn Ctrl+C để dừng tiến trình.
echo ========================================================
echo.
python pipeline\watcher.py %*
pause
