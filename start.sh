#!/usr/bin/env bash
# Vigil — startup script (macOS / Linux)
# Usage: ./start.sh
# Starts PocketBase on :8090 and the Vite dev server on :5173.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/backend" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

# ── PocketBase binary ─────────────────────────────────────────────────────────

PB_BIN="$BACKEND_DIR/pocketbase"

if [ ! -f "$PB_BIN" ]; then
  echo "[start.sh] PocketBase binary not found — downloading v0.36.5..."

  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"

  case "$ARCH" in
    x86_64)  ARCH_SUFFIX="amd64" ;;
    aarch64|arm64) ARCH_SUFFIX="arm64" ;;
    *)
      echo "[start.sh] ERROR: unsupported architecture: $ARCH"
      exit 1
      ;;
  esac

  # NOTE: The migration files (001_initial_schema.js) use the PocketBase v0.22+
  # JavaScript migration API (new TextField(), new RelationField(), etc.).
  # Pinning below v0.22 will cause "TextField is not defined" at startup.
  # Pinned to v0.36.5 — bump both this and start.bat together when upgrading.
  PB_VERSION="0.36.5"
  ZIP="pocketbase_${PB_VERSION}_${OS}_${ARCH_SUFFIX}.zip"
  URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"

  TMP_DIR=$(mktemp -d)
  echo "[start.sh] Downloading $URL..."
  curl -fsSL "$URL" -o "$TMP_DIR/$ZIP"
  unzip -q "$TMP_DIR/$ZIP" -d "$TMP_DIR"
  mv "$TMP_DIR/pocketbase" "$PB_BIN"
  chmod +x "$PB_BIN"
  rm -rf "$TMP_DIR"
  echo "[start.sh] PocketBase v${PB_VERSION} downloaded to $PB_BIN"
fi

# ── Locate npm ────────────────────────────────────────────────────────────────

if ! command -v npm &>/dev/null; then
  echo "[start.sh] ERROR: npm not found."
  echo "           Install Node.js 18+ from https://nodejs.org/"
  echo "           If using nvm, source it first: source ~/.nvm/nvm.sh && nvm use --lts && ./start.sh"
  exit 1
fi

# ── Frontend dependencies ─────────────────────────────────────────────────────

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[start.sh] Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

# ── Start PocketBase ──────────────────────────────────────────────────────────

echo "[start.sh] Starting PocketBase on http://localhost:8090 ..."
"$PB_BIN" serve \
  --http="localhost:8090" \
  --dir="$BACKEND_DIR/pb_data" \
  --migrationsDir="$BACKEND_DIR/pb_migrations" &
PB_PID=$!

# Give PocketBase a moment to run initial migrations
sleep 2

# ── Start Vite dev server ─────────────────────────────────────────────────────

echo "[start.sh] Starting Vite dev server on http://localhost:5173 ..."
(cd "$FRONTEND_DIR" && npm run dev) &
VITE_PID=$!

echo ""
echo "  PocketBase admin UI  →  http://localhost:8090/_/"
echo "  App                  →  http://localhost:5173"
echo ""
echo "  Press Ctrl-C to stop both services."

trap 'echo ""; echo "[start.sh] Shutting down..."; kill $PB_PID $VITE_PID 2>/dev/null; exit 0' INT TERM

wait
