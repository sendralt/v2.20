#!/bin/bash
# FishSmart Pro startup script
# Injects real API keys from environment into Node.js process
# Usage: ./start.sh [production|development]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODE=${1:-production}
export NODE_ENV="$MODE"

# --- API Keys (injected by Agent Zero secret system) ---
export GEMINI_API_KEY="${GEMINI_API_KEY:-your_gemini_api_key_here}"
export OPENWEATHER_API_KEY="${OPENWEATHER_API_KEY:-your_openweather_api_key_here}"
export IPGEOLOCATION_API_KEY="${IPGEOLOCATION_API_KEY:-your_ipgeolocation_api_key_here}"

# --- Stripe Billing (optional) ---
export DATABASE_URL="${DATABASE_URL:-your_database_url_here}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-your_stripe_secret_key_here}"
export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-your_stripe_webhook_secret_here}"
export STRIPE_PRICE_MONTHLY="${STRIPE_PRICE_MONTHLY:-your_stripe_price_monthly_here}"
export STRIPE_PRICE_YEARLY="${STRIPE_PRICE_YEARLY:-your_stripe_price_yearly_here}"
export STRIPE_PORTAL_CONFIG_ID="${STRIPE_PORTAL_CONFIG_ID:-your_stripe_portal_config_id_here}"
export APP_URL="${APP_URL:-https://fishsmart-pro-1.onrender.com}"

# --- Start server ---
echo "Starting FishSmart Pro in $MODE mode..."
exec node server.js
