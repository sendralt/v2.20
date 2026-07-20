#!/bin/bash
# FishSmart Pro startup script
# Loads API keys from .env file (gitignored)
# Usage: ./start.sh [production|development]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Load environment variables from .env (not tracked by git)
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

MODE=${1:-production}
export NODE_ENV="$MODE"

# --- Start server ---
echo "Starting FishSmart Pro in $MODE mode..."
cd app
exec node server.js
