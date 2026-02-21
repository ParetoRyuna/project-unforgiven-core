# Fan Pass Hub (Week-1 Delivery)

Fan Pass Hub is the phase-1 business flow module for:
- release sales (`purchase_release`),
- membership upgrades (`upgrade_membership`),
- task engine completion (`complete_task`),
- unified decision quotes + graph writes + snapshot export.

## Routes

- `GET /api/fan-pass/catalog`
  - response: release list, membership list, task list, release sold metrics
- `POST /api/fan-pass/workflow/execute`
  - request: `wallet, workflow_kind, item_id, proofs?`
  - response: quote + executed flag + event/relation results + latest export snapshot
- `POST /api/graph/events/ingest`
  - request: `wallet, event_type, asset_id, decision?, value_lamports?, context?`
  - response: `event_id, ingest_status, snapshot_version`
- `POST /api/graph/relations/upsert`
  - request: `from_wallet, to_id, edge_type, weight, metadata?`
  - response: `edge_id, updated_at, snapshot_version`
- `GET /api/graph/export?wallet=<base58>`
  - response: wallet scoped graph export + reputation snapshot
- `POST /api/graph/snapshots/anchor`
  - response: `snapshot_hash_hex, snapshot_version, anchor_tx_signature, mode, chain`
- `POST /api/graph/snapshots/anchor/daily`
  - protected by `Authorization: Bearer <HUB_DAILY_ANCHOR_TOKEN>`
  - used by scheduled jobs

## Frontend Console

- `/fan-pass`
  - runs full business flows: release purchase, membership upgrade, task completion
  - includes activity feed + anchor trigger

## Storage and Anchor Settings

- `HUB_GRAPH_STORE_PATH` (optional)
  - default: `/tmp/wanwan-fan-pass-graph.json`
- `HUB_SOLANA_MOCK_MODE`
  - default: `0` (on-chain anchor)
  - set `1` only for local mock debug
- `HUB_SOLANA_RPC_URL`
  - default: `http://127.0.0.1:8899`
- `HUB_ANCHOR_KEYPAIR_PATH`
  - required when `HUB_SOLANA_MOCK_MODE=0`
- `HUB_DAILY_ANCHOR_TOKEN`
  - required for `/api/graph/snapshots/anchor/daily`

## Daily Anchor Automation

- Script: `scripts/anchor_daily_v2.sh`
- NPM command: `npm run anchor:daily:v2`
- Secrets setup helper: `npm run anchor:secrets:v2 -- https://<your-domain>/api/graph/snapshots/anchor/daily`
- GitHub workflow: `.github/workflows/fan-pass-daily-anchor.yml`
  - requires secrets:
    - `HUB_DAILY_ANCHOR_URL`
    - `HUB_DAILY_ANCHOR_TOKEN`

## Quick Smoke

```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
npm run test:hub
npm run dev
# open http://localhost:3000/fan-pass
```
