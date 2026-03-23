#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
CLUSTER="${CLUSTER:-devnet}"
ANCHOR_CLUSTER="${ANCHOR_CLUSTER:-$RPC_URL}"
KEYPAIR_PATH="${KEYPAIR_PATH:-$HOME/.config/solana/id.json}"
PROGRAM_NAME="${PROGRAM_NAME:-unforgiven_v2}"
MIN_BALANCE_SOL="${MIN_BALANCE_SOL:-3}"
PROGRAM_SO_PATH="$ROOT/target/deploy/${PROGRAM_NAME}.so"
PROGRAM_KEYPAIR_PATH="$ROOT/target/deploy/${PROGRAM_NAME}-keypair.json"

if [[ ! -f "$KEYPAIR_PATH" ]]; then
  echo "ERROR: deploy wallet not found: $KEYPAIR_PATH" >&2
  exit 1
fi

if [[ ! -f "$PROGRAM_KEYPAIR_PATH" ]]; then
  echo "ERROR: program keypair not found: $PROGRAM_KEYPAIR_PATH" >&2
  exit 1
fi

program_id() {
  node -e "const fs=require('fs');const {Keypair}=require('@solana/web3.js');const raw=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(Keypair.fromSecretKey(Uint8Array.from(raw)).publicKey.toBase58())" "$PROGRAM_KEYPAIR_PATH"
}

file_size_bytes() {
  local path="$1"
  stat -f %z "$path" 2>/dev/null || stat -c %s "$path"
}

BALANCE_RAW="$(solana balance --url "$RPC_URL" --keypair "$KEYPAIR_PATH" 2>/dev/null || true)"
BALANCE_SOL="$(printf '%s' "$BALANCE_RAW" | awk '{print $1}')"
if [[ -z "$BALANCE_SOL" ]]; then
  echo "ERROR: failed to read wallet balance from $RPC_URL" >&2
  exit 1
fi

awk "BEGIN {exit !($BALANCE_SOL < $MIN_BALANCE_SOL)}" && {
  echo "ERROR: balance too low for devnet deploy. wallet=$KEYPAIR_PATH balance=${BALANCE_SOL} SOL required>=${MIN_BALANCE_SOL} SOL" >&2
  exit 1
}

echo "[deploy_v2_devnet] building $PROGRAM_NAME"
PATH="$ROOT/scripts:$PATH" anchor build -p "$PROGRAM_NAME" --provider.wallet "$KEYPAIR_PATH"

PROGRAM_ID="$(program_id)"
LOCAL_SO_BYTES="$(file_size_bytes "$PROGRAM_SO_PATH")"
ONCHAIN_DATA_LEN="$(solana program show "$PROGRAM_ID" --url "$RPC_URL" 2>/dev/null | awk '/Data Length:/ {print $3}' || true)"
if [[ -n "$ONCHAIN_DATA_LEN" ]] && [[ "$LOCAL_SO_BYTES" -gt "$ONCHAIN_DATA_LEN" ]]; then
  ADDITIONAL_BYTES=$((LOCAL_SO_BYTES - ONCHAIN_DATA_LEN))
  echo "[deploy_v2_devnet] extending program data from ${ONCHAIN_DATA_LEN} -> ${LOCAL_SO_BYTES} bytes"
  solana program extend "$PROGRAM_ID" "$ADDITIONAL_BYTES" --url "$RPC_URL" --keypair "$KEYPAIR_PATH"
fi

echo "[deploy_v2_devnet] deploying $PROGRAM_NAME to $CLUSTER"
anchor deploy -p "$PROGRAM_NAME" --provider.cluster "$ANCHOR_CLUSTER" --provider.wallet "$KEYPAIR_PATH"

echo "[deploy_v2_devnet] syncing program id + idl"
node ./scripts/sync-deploy.js \
  --program-name "$PROGRAM_NAME" \
  --idl-name "$PROGRAM_NAME" \
  --cluster "$CLUSTER" \
  --rpc-url "$RPC_URL"

if [[ "${SKIP_INIT_ADMIN:-0}" == "1" ]]; then
  echo "[deploy_v2_devnet] skipping admin init (SKIP_INIT_ADMIN=1)"
  exit 0
fi

if [[ -z "${SHIELD_API_BASE:-}" && -z "${ORACLE_PUBLIC_KEY:-}" && -z "${ORACLE_KEYPAIR_PATH:-}" && -z "${ORACLE_PRIVATE_KEY:-}" ]]; then
  echo "ERROR: missing oracle runtime config for admin init." >&2
  echo "Set one of SHIELD_API_BASE, ORACLE_PUBLIC_KEY, ORACLE_KEYPAIR_PATH, or ORACLE_PRIVATE_KEY and rerun." >&2
  exit 1
fi

echo "[deploy_v2_devnet] initializing global/admin config"
RPC_URL="$RPC_URL" KEYPAIR_PATH="$KEYPAIR_PATH" node ./scripts/init_admin_v2.js

echo
echo "[deploy_v2_devnet] ready"
echo "- cluster: $CLUSTER"
echo "- rpc: $RPC_URL"
echo "- wallet: $(solana address --keypair "$KEYPAIR_PATH")"
echo "- program: $PROGRAM_ID"
