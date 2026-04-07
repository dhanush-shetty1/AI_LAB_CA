@echo off
title Academic Planner AI - Backend Server
cd /d %~dp0

REM Activate virtual environment
if exist .venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
) else (
    echo ERROR: Virtual environment not found!
    echo Please run: python -m venv .venv
    echo Then run: .venv\Scripts\activate.bat
    pause
    exit /b 1
)

REM Start FastAPI server
echo Starting FastAPI server on http://127.0.0.1:8000/
echo.
python main.py

