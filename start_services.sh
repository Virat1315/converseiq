#!/bin/bash

# Call Manager Dashboard - Startup Script for macOS/Linux
# This script starts all necessary services

echo ""
echo "========================================"
echo "  🚀 Rapid X AI Call Manager"
echo "========================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    echo "Please create .env file with your API credentials"
    echo ""
    exit 1
fi

# Check if virtual environment exists
if [ ! -d .venv ]; then
    echo "❌ ERROR: Virtual environment not found!"
    echo "Please run: python3 -m venv .venv"
    echo ""
    exit 1
fi

echo "✅ Prerequisites OK"
echo ""
echo "Starting services..."
echo ""

# Create data directory if it doesn't exist
mkdir -p data
echo "✅ Created/verified data directory"

# Activate virtual environment
source .venv/bin/activate

# Start services in separate terminal windows/tabs

echo "Opening Terminal 1: AI Agent Worker..."
open -a Terminal --args "source .venv/bin/activate && python agent.py start" 2>/dev/null || \
gnome-terminal -- bash -c "source .venv/bin/activate && python agent.py start" 2>/dev/null || \
xterm -e "source .venv/bin/activate && python agent.py start" &

sleep 1

echo "Opening Terminal 2: Call Analyzer Service..."
open -a Terminal --args "source .venv/bin/activate && python call_analyzer.py" 2>/dev/null || \
gnome-terminal -- bash -c "source .venv/bin/activate && python call_analyzer.py" 2>/dev/null || \
xterm -e "source .venv/bin/activate && python call_analyzer.py" &

sleep 1

echo "Opening Terminal 3: Dashboard (Next.js)..."
open -a Terminal --args "cd dashboard && npm run dev" 2>/dev/null || \
gnome-terminal -- bash -c "cd dashboard && npm run dev" 2>/dev/null || \
xterm -e "cd dashboard && npm run dev" &

echo ""
echo "========================================"
echo "  ✅ All services starting..."
echo "========================================"
echo ""
echo "Dashboard: http://localhost:3000"
echo "Agent: Running on LiveKit"
echo "Analyzer: http://localhost:5000"
echo ""
echo "Check the terminal windows for service logs"
echo ""




