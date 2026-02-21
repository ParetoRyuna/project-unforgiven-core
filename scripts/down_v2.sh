#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VAL_LEDGER="/tmp/wanwan-ledger"
VAL_PIDFILE="/tmp/wanwan-validator.pid"
NEXT_PIDFILE="/tmp/wanwan-next-3100.pid"
SEN_PIDFILE="/tmp/wanwan-sentinel-v2.pid"
RUN_ENV="/tmp/wanwan-v2.env"

CLEAN_LEDGER=0
if [[ "${1:-}" == "--clean-ledger" ]]; then
  CLEAN_LEDGER=1
fi

function _kill_pid() {
  local pid="$1"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  kill "$pid" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  kill -9 "$pid" >/dev/null 2>&1 || true
}

function _stop_pidfile() {
  local name="$1"
  local pidfile="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      echo "[down_v2] stopping $name pid=$pid"
      _kill_pid "$pid"
    fi
    rm -f "$pidfile"
  fi
}

function _stop_port_if_matches() {
  local port="$1"
  local needle="$2"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  for pid in $pids; do
    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$cmd" == *"$needle"* ]]; then
      echo "[down_v2] stopping pid=$pid on port=$port cmd=$cmd"
      _kill_pid "$pid"
    fi
  done
}

_stop_pidfile "sentinel" "$SEN_PIDFILE"
_stop_pidfile "next" "$NEXT_PIDFILE"
_stop_pidfile "validator" "$VAL_PIDFILE"

# Best-effort cleanup for stray processes if pidfiles were lost.
_stop_port_if_matches 3100 "next dev"
_stop_port_if_matches 8899 "solana-test-validator"
_stop_port_if_matches 9900 "solana-test-validator"

if [[ "$CLEAN_LEDGER" -eq 1 ]]; then
  echo "[down_v2] cleaning ledger $VAL_LEDGER"
  rm -rf "$VAL_LEDGER"
fi

rm -f "$RUN_ENV"

echo "[down_v2] done"
