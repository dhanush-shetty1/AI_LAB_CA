@echo off
title Academic Planner AI - Frontend Dev Server
cd /d %~dp0

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
)

REM Start Vite dev server
echo Starting Vite development server on http://localhost:5173/
echo.
echo IMPORTANT: Make sure the backend is running at http://127.0.0.1:8000/
echo Click "Check Backend Status" in the app to verify the backend is running.
echo.
call npm run dev
