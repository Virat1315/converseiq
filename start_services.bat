@echo off
REM Call Manager Dashboard - Startup Script for Windows
REM This script starts all necessary services

echo.
echo ========================================
echo  🚀 Rapid X AI Call Manager
echo ========================================
echo.

REM Check if .env file exists
if not exist .env (
    echo ❌ ERROR: .env file not found!
    echo Please create .env file with your API credentials
    echo.
    pause
    exit /b 1
)

REM Activate Python virtual environment
if not exist .venv\Scripts\activate.bat (
    echo ❌ ERROR: Virtual environment not found!
    echo Please run: python -m venv .venv
    echo.
    pause
    exit /b 1
)

echo ✅ Prerequisites OK
echo.
echo Starting services...
echo.

REM Create data directory if it doesn't exist
if not exist data (
    mkdir data
    echo ✅ Created data directory
)

REM Start services in separate windows

echo Opening Terminal 1: AI Agent Worker...
start "AI Agent Worker" cmd /k ".venv\Scripts\activate.bat && python agent.py start"

echo Opening Terminal 2: Call Analyzer Service...
start "Call Analyzer" cmd /k ".venv\Scripts\activate.bat && python call_analyzer.py"

echo Opening Terminal 3: Dashboard (Next.js)...
start "Dashboard" cmd /k "cd dashboard && npm run dev"

echo.
echo ========================================
echo  ✅ All services starting...
echo ========================================
echo.
echo Dashboard: http://localhost:3000
echo Agent: Running on LiveKit
echo Analyzer: http://localhost:5000
echo.
echo Press any key to continue...
pause




