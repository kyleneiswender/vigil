#!/usr/bin/env bash
# Vulnerability Prioritization Tool — cleanup script (macOS / Linux)
# Kills any orphaned PocketBase and Vite/node processes left behind
# after an unclean shutdown.

set -euo pipefail

echo "[cleanup] Stopping any running pocketbase processes..."
if pkill -f "pocketbase serve" 2>/dev/null; then
    echo "  Killed pocketbase"
else
    echo "  No pocketbase found"
fi

echo "[cleanup] Stopping any process listening on port 5173 (Vite)..."
if lsof -ti:5173 >/dev/null 2>&1; then
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo "  Killed Vite (port 5173)"
else
    echo "  No process found on port 5173"
fi

echo "[cleanup] Done."
