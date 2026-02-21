#!/usr/bin/env bash
set -euo pipefail

VAL_PIDFILE="/tmp/wanwan-validator.pid"
NEXT_PIDFILE="/tmp/wanwan-next-3100.pid"
SEN_PIDFILE="/tmp/wanwan-sentinel-v2.pid"
VAL_LOG="/tmp/wanwan-validator.log"
NEXT_LOG="/tmp/wanwan-next-3100.log"
SEN_LOG="/tmp/wanwan-sentinel-v2.log"
RUN_ENV="/tmp/wanwan-v2.env"

function _cmd() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

function _show_pid() {
  local name="$1"
  local pidfile="$2"
  local expected_regex="$3"
  if [[ ! -f "$pidfile" ]]; then
    echo "- $name: down (missing pidfile $pidfile)"
    return
  fi
  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    echo "- $name: down (empty pidfile $pidfile)"
    return
  fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    echo "- $name: down (stale pid=$pid)"
    return
  fi
  local cmd
  cmd="$(_cmd "$pid")"
  if [[ -n "$expected_regex" ]] && [[ ! "$cmd" =~ $expected_regex ]]; then
    echo "- $name: pid=$pid running unexpected command: $cmd"
    return
  fi
  echo "- $name: up pid=$pid cmd=$cmd"
}

echo "[status_v2] process status"
_show_pid "validator" "$VAL_PIDFILE" "solana-test-validator"
_show_pid "next-api" "$NEXT_PIDFILE" "next dev|npm run dev -p 3100|npm run dev -- -p 3100"
_show_pid "sentinel" "$SEN_PIDFILE" "sentinel-service-v2"

echo
echo "[status_v2] endpoint probes"
if curl -s http://127.0.0.1:8899/health | grep -q ok; then
  echo "- validator health: ok"
else
  echo "- validator health: down"
fi

if curl -s http://127.0.0.1:3100/api/oracle-pubkey | grep -q oraclePubkey; then
  echo "- oracle API: ready"
else
  echo "- oracle API: down"
fi

echo
echo "[status_v2] log hints"
[[ -f "$VAL_LOG" ]] && echo "- validator log: $VAL_LOG" || echo "- validator log missing: $VAL_LOG"
[[ -f "$NEXT_LOG" ]] && echo "- next log: $NEXT_LOG" || echo "- next log missing: $NEXT_LOG"
[[ -f "$SEN_LOG" ]] && echo "- sentinel log: $SEN_LOG" || echo "- sentinel log missing: $SEN_LOG"
[[ -f "$RUN_ENV" ]] && echo "- run metadata: $RUN_ENV" || true

if [[ -f "$SEN_LOG" ]]; then
  echo
  echo "[status_v2] sentinel recent key lines"
  grep -E "connected to Solana pubsub|preview event received|attack assessment triggered|governance action submitted|admin_config active_scoring_model_hash verified" "$SEN_LOG" | tail -n 10 || true
fi
