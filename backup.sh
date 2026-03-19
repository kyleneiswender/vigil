#!/usr/bin/env bash
# Vigil — database backup script (macOS / Linux)
# Copies backend/pb_data to a timestamped folder under backups/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PB_DATA="$SCRIPT_DIR/backend/pb_data"
BACKUP_DIR="$SCRIPT_DIR/backups"

# ── Check pb_data exists ──────────────────────────────────────────────────────

if [ ! -d "$PB_DATA" ]; then
    echo "[backup] ERROR: backend/pb_data not found. Nothing to back up."
    echo "  Run the application at least once so PocketBase creates the database."
    exit 1
fi

# ── Warn if PocketBase is running ─────────────────────────────────────────────

if pgrep -f "pocketbase serve" >/dev/null 2>&1; then
    echo "[backup] WARNING: PocketBase appears to be running."
    echo "  Backing up while the database is in use may produce an inconsistent snapshot."
    echo "  For a clean backup, stop PocketBase first (Ctrl-C in the start window)."
    echo ""
    read -rp "  Continue anyway? (y/N): " REPLY
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
        echo "[backup] Aborted."
        exit 0
    fi
fi

# ── Copy ──────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date +"%Y-%m-%d_%H%M")
DEST="$BACKUP_DIR/pb_data_$TIMESTAMP"

mkdir -p "$DEST"
echo "[backup] Copying backend/pb_data -> backups/pb_data_$TIMESTAMP ..."
cp -r "$PB_DATA/." "$DEST/"
echo "[backup] Done. Backup saved to: $DEST"
