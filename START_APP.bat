@echo off
title Academic Planner AI - Full Startup

echo.
echo ====================================
echo   Academic Planner AI
echo   Complete Startup Script
echo ====================================
echo.

REM Check if we're in the right directory
if not exist backend\main.py (
    echo ERROR: backend\main.py not found!
    echo Please run this script from: C:\...\Academic Planner AI CA\AI_LAB_CA
    pause
    exit /b 1
)

if not exist frontend\package.json (
    echo ERROR: frontend\package.json not found!
    echo Please run this script from: C:\...\Academic Planner AI CA\AI_LAB_CA
    pause
    exit /b 1
)

echo This script will start both backend and frontend.
echo Two new terminal windows will open.
echo.
echo BACKEND:  http://127.0.0.1:8000/
echo FRONTEND: http://localhost:5173/
echo.
echo Press any key to continue...
pause

REM Start backend in new window
echo Starting backend...
start "Academic Planner - Backend (Keep this window open)" cmd /k cd /d backend && start-backend.bat

REM Wait a moment for backend to start
timeout /t 3 /nobreak

REM Start frontend in new window
echo Starting frontend...
start "Academic Planner - Frontend (Keep this window open)" cmd /k cd /d frontend && start-frontend.bat

echo.
echo Both services are starting...
echo - Backend will open in first window
echo - Frontend will open in second window
echo.
echo The frontend should automatically open in your browser at http://localhost:5173/
echo If it doesn't, manually open: http://localhost:5173/
echo.
echo To stop the application, close both terminal windows.
pause
