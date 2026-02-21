#!/usr/bin/env bash
set -euo pipefail

ANCHOR_URL="${HUB_DAILY_ANCHOR_URL:-http://127.0.0.1:3000/api/graph/snapshots/anchor/daily}"
ANCHOR_TOKEN="${HUB_DAILY_ANCHOR_TOKEN:-}"

if [[ -z "${ANCHOR_TOKEN}" ]]; then
  echo "HUB_DAILY_ANCHOR_TOKEN is required"
  exit 1
fi

echo "[daily-anchor] POST ${ANCHOR_URL}"
resp="$(curl -sS -X POST "${ANCHOR_URL}" -H "Authorization: Bearer ${ANCHOR_TOKEN}" -H "Content-Type: application/json")"
echo "${resp}"

if ! printf '%s' "${resp}" | grep -q '"anchor_tx_signature"'; then
  echo "[daily-anchor] anchor tx signature missing"
  exit 1
fi

echo "[daily-anchor] success"
