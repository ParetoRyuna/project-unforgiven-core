# UNFORGIVEN v2 Ops Runbook

This file contains operational details moved out of `README.md` so the top-level narrative stays focused on the product and evidence.

## Scope

Use this runbook for:
- local v2 demo bring-up
- strict validation (`gate:all`)
- sentinel monitoring / governance verification
- troubleshooting local demo runs

Primary v2 components:
- Program: `/Users/lenovo/Desktop/HACKTHON PROJECT/programs/unforgiven_v2`
- Shield API: `/Users/lenovo/Desktop/HACKTHON PROJECT/app/api/shield-score/route.ts`
- Sentinel: `/Users/lenovo/Desktop/HACKTHON PROJECT/crates/sentinel`

## Quick Start (Full Demo Stack)

### One-command demo (recommended)

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
bash scripts/demo_v2.sh 40
```

This starts:
- local validator
- Anchor build + deploy
- Next API
- Sentinel v2

### Shutdown

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
bash scripts/down_v2.sh --clean-ledger
```

### Status

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
bash scripts/status_v2.sh
```

## Strict Validation (Primary Acceptance)

### Single acceptance command

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
npm run gate:all
```

`gate:all` = `ci:gate` + `smoke:ops:v2`

What it validates:
1. Program ID consistency checks
2. tx builder smoke check
3. API / SDK / hub tests
4. Program negative tests
5. Sentinel buildability
6. Full burst -> governance -> reset -> post-reset preview flow

### Report outputs

- `/tmp/wanwan-ops-smoke-report.json`
- `/tmp/wanwan-ops-smoke-report-<run_id>.json`

Key stable schema fields:
- `schema_version`
- `run_id`
- `result`
- `failure_step`
- `artifact_tgz`
- `governance_tx_signature`
- `reset_tx_signature`
- `baseline_hash_hex`
- `onchain_hash_hex_after_reset`
- `hash_changed_before_reset`

## 3-Minute Judge Demo Script (Ops View)

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
npm run up:v2
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/burst_preview_v2.js 40
NODE_NO_WARNINGS=1 SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/reset_admin_v2.js
npm run down:v2
```

Notes:
- `configs/sentinel_config_v2.demo.toml` is tuned to trigger governance in demos.
- `configs/sentinel_config_v2.toml` is production-like and may not trigger on a small burst.

## Bring-up Variants

### Production-like sentinel thresholds

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
SENTINEL_CONFIG=configs/sentinel_config_v2.toml bash scripts/up_v2.sh
```

### Production-like startup + strict Oracle key

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
npm run oracle:keygen:v2
export ORACLE_KEYPAIR_PATH="/Users/lenovo/Desktop/HACKTHON PROJECT/.keys/oracle-v2.json"
export ORACLE_REQUIRE_STATIC_KEY=1
npm run up:v2:prod
```

### Sentinel manual run (debug logs)

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
RUST_LOG=sentinel_service_v2=debug cargo run -p sentinel-service-v2 -- configs/sentinel_config_v2.toml
```

## Common Commands

### v2 one-liner trigger (quick preview)

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT" && (lsof -ti tcp:3100 >/dev/null || (npm run dev -- -p 3100 >/tmp/wanwan-dev-3100.log 2>&1 &)) && for i in $(seq 1 40); do curl -s http://127.0.0.1:3100/api/oracle-pubkey | grep -q 'oraclePubkey' && break; sleep 1; done && out="$(SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/trigger_preview_v2.js 2>&1)"; echo "$out"; tx="$(printf '%s\n' "$out" | sed -n 's/^previewPrice tx: //p' | tail -1)"; [ -n "$tx" ] && solana confirm -v "$tx" --url http://127.0.0.1:8899 || echo "未提取到 previewPrice tx（看 /tmp/wanwan-dev-3100.log）"
```

### Admin guardrail reset

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
SHIELD_API_BASE=http://127.0.0.1:3100 node ./scripts/reset_admin_v2.js
```

### Ops smoke directly

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
bash scripts/ops_smoke_v2.sh 40
```

## Failure Artifacts

On any `ops_smoke_v2.sh` failure, logs are packed to:
- `/tmp/wanwan-ops-smoke-artifacts-<run_id>.tar.gz`

Latest artifact symlink:
- `/tmp/wanwan-ops-smoke-artifacts-latest.tar.gz`

Optional knobs:
- `AUTO_DOWN=0` keep services running after smoke
- `ALWAYS_ARCHIVE=1` archive even on success
- `FORCE_FAIL_STEP=status` force failure for archive drill

## Security Toggles (Operational)

### Emergency freeze

- `SHIELD_FREEZE=1` returns `503` on `/api/shield-score`

### Rate limits

- `SHIELD_RATE_WINDOW_SECS` (default `60`)
- `SHIELD_RATE_LIMIT_PER_IP` (default `120`)
- `SHIELD_RATE_LIMIT_PER_WALLET` (default `60`)
- `SHIELD_RATE_LIMIT_REQUIRE_REDIS`
  - production default: fail-closed if Redis backend is unavailable
  - set `0` only for controlled dev fallback
- `SHIELD_TRUST_PROXY_HEADERS=1`
  - trust `x-forwarded-for` / `x-real-ip` only behind a trusted proxy

### Oracle key hardening

- `ORACLE_REQUIRE_STATIC_KEY=1`
- `ORACLE_PRIVATE_KEY` or `ORACLE_KEYPAIR_PATH`
- production defaults to strict static key unless `ORACLE_ALLOW_EPHEMERAL_IN_PRODUCTION=1`

### Reclaim verification hardening

- `RECLAIM_ALLOWED_PROVIDERS=...`
  - required in production (comma-separated allowlist)
- `RECLAIM_REQUIRE_CONTEXT_MATCH=1`
  - default on; disable only in controlled debugging

### Replay protection storage

- `REDIS_URL=redis://127.0.0.1:6379` (recommended for multi-instance consistency)
- `RECLAIM_REPLAY_REQUIRE_REDIS`
  - production default: fail-closed if Redis backend is unavailable
- `RECLAIM_REPLAY_PREFIX=reclaim:proof-id`
- `RECLAIM_REPLAY_TTL_SECONDS=300`

## Troubleshooting

### `ECONNREFUSED 127.0.0.1:3100`

Next API is not ready. Run:

```bash
bash scripts/up_v2.sh
tail -n 120 /tmp/wanwan-next-3100.log
```

### Sentinel looks idle after `connected to Solana pubsub`

This is normal at `info` level. Use debug logs:

```bash
RUST_LOG=sentinel_service_v2=debug cargo run -p sentinel-service-v2 -- configs/sentinel_config_v2.demo.toml
```

### macOS validator error: `extra entry found: ._genesis.bin`

Run validator with:

```bash
COPYFILE_DISABLE=1 solana-test-validator --reset
```

The bundled scripts already do this.

### Node deprecation noise (`DEP0040 punycode`)

Loop scripts suppress it by default. Re-enable for debugging:

```bash
SHOW_NODE_DEPRECATION=1 ...
```

## Log Queries (Judge / Debug Friendly)

### Oracle issue logs

```bash
grep -E '"event":"shield_score_issued".*"wallet".*"nonce".*"tier".*"blocked".*"price_lamports"' /tmp/wanwan-next-3100.log | tail -n 20
```

### Trigger / burst result logs

```bash
grep -E '"event":"preview_trigger_result"|"event":"preview_burst_result"' /tmp/wanwan-ops-smoke-preview.log /tmp/wanwan-ops-smoke-burst.log 2>/dev/null | tail -n 20
```

### Sentinel governance logs

```bash
grep -E 'attack assessment triggered|governance action submitted|admin_config active_scoring_model_hash verified' /tmp/wanwan-sentinel-v2.log | tail -n 30
```

### Monitoring quick check

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
npm run alerts:v2
```

## Safety / Consistency Gates (Fast Checks)

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
npm run check:program-id
npm run check:getrandom-patch
npm run smoke:tx-builder:v2
```
