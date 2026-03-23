#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_BASE="${SHIELD_API_BASE:-http://127.0.0.1:3100}"
BURST_N="${1:-40}"
LOG_FILE="$(mktemp -t wanwan-loom-shadow.XXXXXX.log)"

if ! curl -fsS "$API_BASE/api/oracle-pubkey" >/dev/null 2>&1; then
  echo "ERROR: UNFORGIVEN local API is not ready at $API_BASE"
  echo "Run this first:"
  echo "  npm run up:v2"
  exit 1
fi

echo "[loom_shadow] running observe-only burst demo"
echo "[loom_shadow] api=$API_BASE burst_n=$BURST_N"

NODE_NO_WARNINGS=1 SHIELD_API_BASE="$API_BASE" node ./scripts/burst_preview_v2.js "$BURST_N" >"$LOG_FILE" 2>&1
NODE_NO_WARNINGS=1 SHIELD_API_BASE="$API_BASE" node ./scripts/trigger_preview_v2.js >>"$LOG_FILE" 2>&1

echo
echo "[loom_shadow] summary"
if ! grep -E 'done: sent=|preview_(burst_result|trigger_result)' "$LOG_FILE"; then
  cat "$LOG_FILE"
fi

echo
echo "[loom_shadow] full_log=$LOG_FILE"
