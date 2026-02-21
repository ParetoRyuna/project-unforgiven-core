#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VAL_LEDGER="/tmp/wanwan-ledger"
VAL_LOG="/tmp/wanwan-validator.log"
VAL_PIDFILE="/tmp/wanwan-validator.pid"

NEXT_LOG="/tmp/wanwan-next-3100.log"
NEXT_PIDFILE="/tmp/wanwan-next-3100.pid"

SEN_LOG="/tmp/wanwan-sentinel-v2.log"
SEN_PIDFILE="/tmp/wanwan-sentinel-v2.pid"

ANCHOR_BUILD_LOG="/tmp/wanwan-anchor-build.log"
ANCHOR_DEPLOY_LOG="/tmp/wanwan-anchor-deploy.log"

RUN_ENV="/tmp/wanwan-v2.env"

HEALTH_TIMEOUT_SECS="${HEALTH_TIMEOUT_SECS:-60}"
API_TIMEOUT_SECS="${API_TIMEOUT_SECS:-60}"
SENTINEL_TIMEOUT_SECS="${SENTINEL_TIMEOUT_SECS:-60}"
SENTINEL_CONFIG="${SENTINEL_CONFIG:-configs/sentinel_config_v2.demo.toml}"

if [[ "${ORACLE_REQUIRE_STATIC_KEY:-0}" == "1" ]]; then
  if [[ -z "${ORACLE_PRIVATE_KEY:-}" && -z "${ORACLE_KEYPAIR_PATH:-}" ]]; then
    echo "ERROR: ORACLE_REQUIRE_STATIC_KEY=1 but ORACLE_PRIVATE_KEY/ORACLE_KEYPAIR_PATH not set" >&2
    exit 1
  fi
  if [[ -n "${ORACLE_KEYPAIR_PATH:-}" && ! -f "${ORACLE_KEYPAIR_PATH}" ]]; then
    echo "ERROR: ORACLE_KEYPAIR_PATH does not exist: ${ORACLE_KEYPAIR_PATH}" >&2
    exit 1
  fi
fi

if ! command -v perl >/dev/null 2>&1; then
  echo "ERROR: perl is required (used to setsid/detach background services on macOS)" >&2
  exit 1
fi

function _cmd() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

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
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      _kill_pid "$pid"
    fi
    rm -f "$pidfile"
  fi
}

function _port_pids() {
  local port="$1"
  lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true
}

function _stop_known_port_owners() {
  local ports=(8899 8900 9900 3100)
  for port in "${ports[@]}"; do
    local pids
    pids="$(_port_pids "$port")"
    for pid in $pids; do
      local cmd
      cmd="$(_cmd "$pid")"
      case "$port" in
        8899|8900|9900)
          if [[ "$cmd" == *"solana-test-validator"* ]]; then
            echo "[up_v2] restarting stale validator process pid=$pid on port=$port"
            _kill_pid "$pid"
          fi
          ;;
        3100)
          if [[ "$cmd" == *"next dev"* ]] || [[ "$cmd" == *"npm run dev -- -p 3100"* ]]; then
            echo "[up_v2] restarting stale next process pid=$pid on port=$port"
            _kill_pid "$pid"
          fi
          ;;
      esac
    done
  done
}

function _assert_ports_free() {
  local ports=(8899 8900 9900 3100)
  for port in "${ports[@]}"; do
    local pids
    pids="$(_port_pids "$port")"
    if [[ -n "$pids" ]]; then
      echo "ERROR: port $port is already in use by PID(s): $pids" >&2
      for pid in $pids; do
        echo "  PID $pid: $(_cmd "$pid")" >&2
      done
      echo "Hint: run bash scripts/down_v2.sh, or stop the conflicting service." >&2
      exit 1
    fi
  done
}

function _wait_health() {
  for _ in $(seq 1 "$HEALTH_TIMEOUT_SECS"); do
    if curl -s http://127.0.0.1:8899/health | grep -q ok; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: validator not healthy; see $VAL_LOG" >&2
  tail -n 80 "$VAL_LOG" >&2 || true
  exit 1
}

function _wait_api() {
  for _ in $(seq 1 "$API_TIMEOUT_SECS"); do
    if curl -s http://127.0.0.1:3100/api/oracle-pubkey | grep -q oraclePubkey; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: Next API not ready; see $NEXT_LOG" >&2
  tail -n 120 "$NEXT_LOG" >&2 || true
  exit 1
}

function _wait_sentinel() {
  for _ in $(seq 1 "$SENTINEL_TIMEOUT_SECS"); do
    if grep -q "connected to Solana pubsub" "$SEN_LOG" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  echo "ERROR: Sentinel did not connect to pubsub; see $SEN_LOG" >&2
  tail -n 120 "$SEN_LOG" >&2 || true
  exit 1
}

function _spawn_detached() {
  local pidfile="$1"
  local logfile="$2"
  shift 2
  : >"$logfile"
  # Detach into a new session so the services survive after this script exits.
  perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' "$@" >>"$logfile" 2>&1 < /dev/null &
  echo $! >"$pidfile"
}

echo "[up_v2] stopping previous wanwan processes (if any)"
_stop_pidfile "$SEN_PIDFILE"
_stop_pidfile "$NEXT_PIDFILE"
_stop_pidfile "$VAL_PIDFILE"

echo "[up_v2] scanning known project-owned listeners for restart"
_stop_known_port_owners

echo "[up_v2] verifying required ports are free"
_assert_ports_free

echo "[up_v2] starting solana-test-validator (macOS: COPYFILE_DISABLE=1)"
rm -rf "$VAL_LEDGER"
COPYFILE_DISABLE=1 _spawn_detached "$VAL_PIDFILE" "$VAL_LOG" solana-test-validator \
  --ledger "$VAL_LEDGER" \
  --rpc-port 8899 \
  --faucet-port 9900 \
  --reset
_wait_health

echo "[up_v2] building+deploying unforgiven_v2"
anchor build -p unforgiven_v2 >"$ANCHOR_BUILD_LOG" 2>&1
anchor deploy -p unforgiven_v2 >"$ANCHOR_DEPLOY_LOG" 2>&1

echo "[up_v2] starting Next API on :3100"
NODE_NO_WARNINGS=1 _spawn_detached "$NEXT_PIDFILE" "$NEXT_LOG" npm run dev -- -p 3100
_wait_api

echo "[up_v2] starting Sentinel v2 (config=$SENTINEL_CONFIG)"
RUST_LOG=sentinel_service_v2=info _spawn_detached "$SEN_PIDFILE" "$SEN_LOG" cargo run -p sentinel-service-v2 -- "$SENTINEL_CONFIG"
_wait_sentinel

VAL_PID="$(cat "$VAL_PIDFILE")"
NEXT_PID="$(cat "$NEXT_PIDFILE")"
SEN_PID="$(cat "$SEN_PIDFILE")"

cat >"$RUN_ENV" <<EOF
VAL_PID=$VAL_PID
NEXT_PID=$NEXT_PID
SEN_PID=$SEN_PID
VAL_LOG=$VAL_LOG
NEXT_LOG=$NEXT_LOG
SEN_LOG=$SEN_LOG
ANCHOR_BUILD_LOG=$ANCHOR_BUILD_LOG
ANCHOR_DEPLOY_LOG=$ANCHOR_DEPLOY_LOG
VAL_LEDGER=$VAL_LEDGER
SENTINEL_CONFIG=$SENTINEL_CONFIG
SHIELD_FREEZE=${SHIELD_FREEZE:-0}
ORACLE_REQUIRE_STATIC_KEY=${ORACLE_REQUIRE_STATIC_KEY:-0}
ORACLE_KEYPAIR_PATH=${ORACLE_KEYPAIR_PATH:-}
SHIELD_RATE_WINDOW_SECS=${SHIELD_RATE_WINDOW_SECS:-60}
SHIELD_RATE_LIMIT_PER_IP=${SHIELD_RATE_LIMIT_PER_IP:-120}
SHIELD_RATE_LIMIT_PER_WALLET=${SHIELD_RATE_LIMIT_PER_WALLET:-60}
EOF

cat <<OUT

[up_v2] ready
- validator: pid=$VAL_PID log=$VAL_LOG ledger=$VAL_LEDGER
- next api:  pid=$NEXT_PID log=$NEXT_LOG url=http://127.0.0.1:3100
- sentinel:  pid=$SEN_PID log=$SEN_LOG config=$SENTINEL_CONFIG
- anchor build log:  $ANCHOR_BUILD_LOG
- anchor deploy log: $ANCHOR_DEPLOY_LOG
- run metadata:      $RUN_ENV
- shield_freeze:     ${SHIELD_FREEZE:-0}
- oracle_static_key: ${ORACLE_REQUIRE_STATIC_KEY:-0}

Next steps:
1) One-command demo (up + burst + governance tx + reset):
   bash scripts/demo_v2.sh 40

2) Burst preview only (trigger governance quickly):
   NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/burst_preview_v2.js 40

3) Legacy loop (slower):
   for i in \$(seq 1 40); do NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/trigger_preview_v2.js >/dev/null || break; done

4) Tail sentinel logs:
   tail -n 100 $SEN_LOG

5) Check process+endpoint status:
   bash scripts/status_v2.sh
OUT
