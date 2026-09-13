@echo off
chcp 65001 > nul
echo ===================================================
echo   白地図手帳 (BlankMap Studio) を起動しています...
echo ===================================================
echo.
echo ブラウザで http://localhost:5173 を開きます。
echo 終了する場合は、このウィンドウを閉じるか Ctrl+C を押してください。
echo.

start "" "http://localhost:5173"
python -m http.server 5173
