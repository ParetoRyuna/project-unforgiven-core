#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

N="${1:-40}"
AUTO_DOWN="${AUTO_DOWN:-1}"
ALWAYS_ARCHIVE="${ALWAYS_ARCHIVE:-0}"
FORCE_FAIL_STEP="${FORCE_FAIL_STEP:-}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
SCHEMA_VERSION="wanwan.ops_smoke.v1"
LAST_STEP="init"

SEN_LOG="/tmp/wanwan-sentinel-v2.log"
REPORT="/tmp/wanwan-ops-smoke-report.json"
REPORT_RUN="/tmp/wanwan-ops-smoke-report-$RUN_ID.json"
STATUS_LOG="/tmp/wanwan-ops-smoke-status.log"
BURST_LOG="/tmp/wanwan-ops-smoke-burst.log"
RESET_LOG="/tmp/wanwan-ops-smoke-reset.log"
PREVIEW_LOG="/tmp/wanwan-ops-smoke-preview.log"
UP_LOG="/tmp/wanwan-ops-smoke-up.log"
DOWN_LOG="/tmp/wanwan-ops-smoke-down.log"
ARTIFACT_DIR="/tmp/wanwan-ops-smoke-artifacts-$RUN_ID"
ARTIFACT_TGZ="$ARTIFACT_DIR.tar.gz"
ARTIFACT_LATEST="/tmp/wanwan-ops-smoke-artifacts-latest.tar.gz"
ARTIFACT_TGZ_OUT=""

BURST_TX=""
GOV_TX=""
RESET_TX=""
PREVIEW_TX=""
BASELINE_HASH=""
ONCHAIN_HASH=""
ATTACK_LINE=""
GOV_LINE=""
HASH_VERIFY_LINE=""
GOV_HASH_BEFORE=""
GOV_HASH_AFTER=""
HASH_CHANGED_BEFORE_RESET=""

function json_quote() {
  NODE_NO_WARNINGS=1 node -e 'process.stdout.write(JSON.stringify(process.argv[1] || ""))' "$1"
}

function mark_step() {
  LAST_STEP="$1"
}

function maybe_force_fail() {
  local step="$1"
  if [[ -n "$FORCE_FAIL_STEP" && "$FORCE_FAIL_STEP" == "$step" ]]; then
    echo "ERROR: forced failure at step=$step" >&2
    exit 1
  fi
}

function extract_hash_before() {
  sed -n 's/.*active_scoring_model_hash_before=\([0-9a-fA-F]\{64\}\).*/\1/p'
}

function extract_hash_after() {
  sed -n 's/.*active_scoring_model_hash_after=\([0-9a-fA-F]\{64\}\).*/\1/p'
}

function strip_ansi() {
  # Remove ANSI escape sequences (colors/styles) from logs before parsing.
  sed -E $'s/\x1B\\[[0-9;]*[A-Za-z]//g'
}

function extract_tx_signature() {
  sed -n -E 's/.*tx_signature=([^ ]+).*/\1/p'
}

function write_report() {
  local result="$1"
  local failure_step="$2"
  local artifact_tgz="$3"
  local now_utc
  now_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  local failure_json="null"
  if [[ -n "$failure_step" ]]; then
    failure_json="$(json_quote "$failure_step")"
  fi

  local artifact_json="null"
  if [[ -n "$artifact_tgz" ]]; then
    artifact_json="$(json_quote "$artifact_tgz")"
  fi

  local hash_changed_json="null"
  if [[ "$HASH_CHANGED_BEFORE_RESET" == "true" || "$HASH_CHANGED_BEFORE_RESET" == "false" ]]; then
    hash_changed_json="$HASH_CHANGED_BEFORE_RESET"
  fi

  cat >"$REPORT" <<EOF
{
  "schema_version": "$SCHEMA_VERSION",
  "run_id": "$RUN_ID",
  "timestamp_utc": "$now_utc",
  "result": "$result",
  "failure_step": $failure_json,
  "artifact_tgz": $artifact_json,
  "burst_attempts": $N,
  "burst_last_tx_signature": $(json_quote "$BURST_TX"),
  "governance_tx_signature": $(json_quote "$GOV_TX"),
  "reset_tx_signature": $(json_quote "$RESET_TX"),
  "post_reset_preview_tx_signature": $(json_quote "$PREVIEW_TX"),
  "baseline_hash_hex": $(json_quote "$BASELINE_HASH"),
  "onchain_hash_hex_after_reset": $(json_quote "$ONCHAIN_HASH"),
  "governance_hash_before": $(json_quote "$GOV_HASH_BEFORE"),
  "governance_hash_after": $(json_quote "$GOV_HASH_AFTER"),
  "hash_changed_before_reset": $hash_changed_json,
  "attack_assessment_line": $(json_quote "$ATTACK_LINE"),
  "governance_line": $(json_quote "$GOV_LINE"),
  "hash_verify_line": $(json_quote "$HASH_VERIFY_LINE"),
  "logs": {
    "up": "$UP_LOG",
    "status": "$STATUS_LOG",
    "burst": "$BURST_LOG",
    "reset": "$RESET_LOG",
    "preview": "$PREVIEW_LOG",
    "down": "$DOWN_LOG",
    "sentinel": "$SEN_LOG"
  }
}
EOF
  cp "$REPORT" "$REPORT_RUN"
}

function archive_artifacts() {
  mkdir -p "$ARTIFACT_DIR"
  cat >"$ARTIFACT_DIR/context.txt" <<EOF
run_id=$RUN_ID
schema_version=$SCHEMA_VERSION
last_step=$LAST_STEP
auto_down=$AUTO_DOWN
always_archive=$ALWAYS_ARCHIVE
force_fail_step=$FORCE_FAIL_STEP
timestamp_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

  local files=(
    "$UP_LOG"
    "$DOWN_LOG"
    "$STATUS_LOG"
    "$BURST_LOG"
    "$RESET_LOG"
    "$PREVIEW_LOG"
    "$REPORT"
    "$REPORT_RUN"
    "$SEN_LOG"
    "/tmp/wanwan-validator.log"
    "/tmp/wanwan-next-3100.log"
    "/tmp/wanwan-anchor-build.log"
    "/tmp/wanwan-anchor-deploy.log"
    "/tmp/wanwan-v2.env"
  )
  for f in "${files[@]}"; do
    if [[ -f "$f" ]]; then
      cp "$f" "$ARTIFACT_DIR/$(basename "$f")" || true
    fi
  done

  tar -czf "$ARTIFACT_TGZ" -C "/tmp" "$(basename "$ARTIFACT_DIR")"
  ln -sfn "$ARTIFACT_TGZ" "$ARTIFACT_LATEST"
}

function cleanup() {
  local rc=$?
  local result="success"
  local failure_step=""
  set +e

  if [[ "$rc" -ne 0 ]]; then
    result="failed"
    failure_step="$LAST_STEP"
  fi

  if [[ "$rc" -ne 0 || "$ALWAYS_ARCHIVE" == "1" ]]; then
    ARTIFACT_TGZ_OUT="$ARTIFACT_TGZ"
  fi

  write_report "$result" "$failure_step" "$ARTIFACT_TGZ_OUT"

  if [[ "$AUTO_DOWN" == "1" ]]; then
    bash scripts/down_v2.sh --clean-ledger >"$DOWN_LOG" 2>&1 || true
  fi

  if [[ -n "$ARTIFACT_TGZ_OUT" ]]; then
    archive_artifacts || true
  fi

  if [[ -n "$ARTIFACT_TGZ_OUT" ]]; then
    echo "[ops_smoke_v2] artifacts: $ARTIFACT_TGZ_OUT"
  fi
  exit "$rc"
}
trap cleanup EXIT

mark_step "up"
echo "[ops_smoke_v2] booting full stack"
bash scripts/up_v2.sh >"$UP_LOG" 2>&1
cat "$UP_LOG"
maybe_force_fail "up"

mark_step "status"
echo "[ops_smoke_v2] checking status"
bash scripts/status_v2.sh | tee "$STATUS_LOG"
grep -q "validator health: ok" "$STATUS_LOG"
grep -q "oracle API: ready" "$STATUS_LOG"
grep -q "sentinel: up" "$STATUS_LOG"
maybe_force_fail "status"

mark_step "burst"
echo "[ops_smoke_v2] bursting preview N=$N"
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 \
  node ./scripts/burst_preview_v2.js "$N" | tee "$BURST_LOG"

BURST_TX="$(sed -n 's/^lastSig: //p' "$BURST_LOG" | tail -n 1)"
if [[ -z "$BURST_TX" ]]; then
  echo "ERROR: burst tx not found" >&2
  exit 1
fi
maybe_force_fail "burst"

mark_step "governance_wait"
echo "[ops_smoke_v2] waiting governance evidence"
GOV_TX=""
for _ in $(seq 1 120); do
  GOV_TX="$(
    grep -E "governance action submitted" "$SEN_LOG" 2>/dev/null \
      | tail -n 1 \
      | strip_ansi \
      | extract_tx_signature \
      | tail -n 1 \
      | tr -d '\r\n' \
      || true
  )"
  if [[ -n "$GOV_TX" ]]; then
    break
  fi
  sleep 0.5
done
if [[ -z "$GOV_TX" ]]; then
  echo "ERROR: governance tx not found in $SEN_LOG" >&2
  tail -n 120 "$SEN_LOG" >&2 || true
  exit 1
fi
maybe_force_fail "governance_wait"

ATTACK_LINE="$(grep -E "attack assessment triggered" "$SEN_LOG" | tail -n 1 | strip_ansi || true)"
GOV_LINE="$(grep -E "governance action submitted" "$SEN_LOG" | tail -n 1 | strip_ansi || true)"
HASH_VERIFY_LINE=""
for _ in $(seq 1 60); do
  HASH_VERIFY_LINE="$(
    grep -E "admin_config active_scoring_model_hash verified" "$SEN_LOG" \
      | tail -n 1 \
      | strip_ansi \
      || true
  )"
  if [[ -n "$HASH_VERIFY_LINE" ]]; then
    break
  fi
  sleep 0.2
done
if [[ -z "$HASH_VERIFY_LINE" ]]; then
  echo "ERROR: governance hash verification line not found in $SEN_LOG" >&2
  exit 1
fi
GOV_HASH_BEFORE="$(printf '%s\n' "$HASH_VERIFY_LINE" | extract_hash_before | tail -n 1)"
GOV_HASH_AFTER="$(printf '%s\n' "$HASH_VERIFY_LINE" | extract_hash_after | tail -n 1)"
if [[ -z "$GOV_HASH_BEFORE" || -z "$GOV_HASH_AFTER" ]]; then
  echo "ERROR: failed to parse governance hash before/after from sentinel log" >&2
  exit 1
fi
if [[ "$GOV_HASH_BEFORE" == "$GOV_HASH_AFTER" ]]; then
  echo "ERROR: governance hash did not change before reset" >&2
  exit 1
fi
HASH_CHANGED_BEFORE_RESET="true"

mark_step "reset"
echo "[ops_smoke_v2] resetting admin guardrails"
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 \
  node ./scripts/reset_admin_v2.js | tee "$RESET_LOG"

RESET_TX="$(sed -n 's/^resetAdminGuardrails tx: //p' "$RESET_LOG" | tail -n 1)"
BASELINE_HASH="$(sed -n 's/^baseline_scoring_model_hash_hex: //p' "$RESET_LOG" | tail -n 1)"
ONCHAIN_HASH="$(sed -n 's/^active_scoring_model_hash_onchain_hex: //p' "$RESET_LOG" | tail -n 1)"

if [[ -z "$RESET_TX" || -z "$BASELINE_HASH" || -z "$ONCHAIN_HASH" ]]; then
  echo "ERROR: reset output incomplete" >&2
  exit 1
fi
if [[ "$BASELINE_HASH" != "$ONCHAIN_HASH" ]]; then
  echo "ERROR: reset hash mismatch baseline=$BASELINE_HASH onchain=$ONCHAIN_HASH" >&2
  exit 1
fi
maybe_force_fail "reset"

mark_step "post_reset_preview"
echo "[ops_smoke_v2] post-reset preview sanity"
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 \
  node ./scripts/trigger_preview_v2.js | tee "$PREVIEW_LOG"
PREVIEW_TX="$(sed -n 's/^previewPrice tx: //p' "$PREVIEW_LOG" | tail -n 1)"
if [[ -z "$PREVIEW_TX" ]]; then
  echo "ERROR: post-reset preview tx missing" >&2
  exit 1
fi
maybe_force_fail "post_reset_preview"

cat <<OUT

[ops_smoke_v2] success
- report: $REPORT
- report(run): $REPORT_RUN
- governance tx: $GOV_TX
- reset tx: $RESET_TX
- post-reset preview tx: $PREVIEW_TX
OUT
