@echo off
title FlowMind Launcher
echo ========================================================
echo       FlowMind - Process Intelligence Platform
echo ========================================================
echo.

echo [1/2] Menjalankan Backend (FastAPI :8000)...
start "FlowMind Backend API" cmd /k "uvicorn backend.main:app --port 8000 --reload"

echo [2/2] Menjalankan Frontend (Vite UI :5173)...
start "FlowMind Frontend UI" cmd /k "cd frontend && npm run dev -- --port 5173"

echo Menunggu server siap...
timeout /t 3 >nul

echo Membuka browser http://localhost:5173/ ...
start http://localhost:5173/

echo.
echo ========================================================
echo  FlowMind Berhasil Dijalankan!
echo  - Frontend: http://localhost:5173/
echo  - Backend API: http://localhost:8000/docs
echo ========================================================
