#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SEN_LOG="/tmp/wanwan-sentinel-v2.log"

N="40"
AUTO_DOWN="0"

if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  N="$1"
  shift || true
fi
if [[ "${1:-}" == "--down" ]]; then
  AUTO_DOWN="1"
  shift || true
fi

echo "[demo_v2] starting full stack (validator + deploy + api:3100 + sentinel)"
bash scripts/up_v2.sh

echo "[demo_v2] bursting preview $N times to trigger governance"
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/burst_preview_v2.js "$N"

echo "[demo_v2] waiting for sentinel governance tx in $SEN_LOG"
GOV_TX=""
for _ in $(seq 1 60); do
  GOV_TX="$(
    grep -E "governance action submitted" "$SEN_LOG" 2>/dev/null \
      | tail -n 1 \
      | sed -E 's/.*tx_signature=([^ ]+).*/\1/' \
      | tr -d '\r\n' \
      || true
  )"
  if [[ -n "$GOV_TX" ]]; then
    break
  fi
  sleep 0.5
done

if [[ -z "$GOV_TX" ]]; then
  echo "ERROR: governance tx not found in sentinel log." >&2
  echo "Hint: tail the log and look for \"attack assessment triggered\" / \"governance action submitted\":" >&2
  tail -n 200 "$SEN_LOG" >&2 || true
  exit 1
fi

echo "[demo_v2] governance tx: $GOV_TX"
echo "[demo_v2] sentinel evidence:"
grep -E "attack assessment triggered|governance action submitted|admin_config active_scoring_model_hash verified" "$SEN_LOG" | tail -n 20 || true

echo "[demo_v2] resetting admin guardrails back to baseline"
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/reset_admin_v2.js

echo "[demo_v2] post-reset preview sanity"
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/trigger_preview_v2.js | tail -n 30

cat <<OUT

[demo_v2] done
- sentinel log: $SEN_LOG
- shutdown: bash scripts/down_v2.sh --clean-ledger
OUT

if [[ "$AUTO_DOWN" -eq 1 ]]; then
  echo "[demo_v2] auto shutdown (--down)"
  bash scripts/down_v2.sh --clean-ledger
fi
