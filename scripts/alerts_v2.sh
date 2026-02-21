#!/usr/bin/env bash
set -euo pipefail

NEXT_LOG="${NEXT_LOG:-/tmp/wanwan-next-3100.log}"
SEN_LOG="${SEN_LOG:-/tmp/wanwan-sentinel-v2.log}"
WINDOW_LINES="${WINDOW_LINES:-2000}"
ERR_5XX_THRESHOLD="${ERR_5XX_THRESHOLD:-10}"
RATE_LIMIT_THRESHOLD="${RATE_LIMIT_THRESHOLD:-200}"

function count_or_zero() {
  local pattern="$1"
  local file="$2"
  if [[ -f "$file" ]]; then
    local count
    count="$(tail -n "$WINDOW_LINES" "$file" | grep -Ec "$pattern" || true)"
    echo "$count"
  else
    echo "0"
  fi
}

shield_5xx_count="$(count_or_zero '"event":"shield_score_error"' "$NEXT_LOG")"
shield_429_count="$(count_or_zero '"event":"shield_rate_limited"' "$NEXT_LOG")"
shield_frozen_count="$(count_or_zero '"event":"shield_score_frozen"' "$NEXT_LOG")"
gov_count="$(count_or_zero 'governance action submitted' "$SEN_LOG")"
reset_count="$(count_or_zero 'resetAdminGuardrails tx:' /tmp/wanwan-ops-smoke-reset.log)"

echo "[alerts_v2] summary"
echo "- window_lines: $WINDOW_LINES"
echo "- shield_score_error(5xx-like): $shield_5xx_count"
echo "- shield_rate_limited(429): $shield_429_count"
echo "- shield_score_frozen: $shield_frozen_count"
echo "- governance_action_submitted: $gov_count"
echo "- reset_admin_guardrails: $reset_count"

if (( shield_5xx_count > ERR_5XX_THRESHOLD )); then
  echo "[alerts_v2] ALERT: shield 5xx errors exceed threshold ($shield_5xx_count > $ERR_5XX_THRESHOLD)" >&2
  exit 2
fi

if (( shield_429_count > RATE_LIMIT_THRESHOLD )); then
  echo "[alerts_v2] ALERT: shield 429 events exceed threshold ($shield_429_count > $RATE_LIMIT_THRESHOLD)" >&2
  exit 3
fi

echo "[alerts_v2] OK"
