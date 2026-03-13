# UNFORGIVEN v2

Universal fairness middleware for high-velocity Solana launches.

UNFORGIVEN v2 combines Shield-first scoring, signed execution payloads, and on-chain verifiable checks to reduce bot extraction without forcing custom anti-bot logic into every app.

## Competition Snapshot (Eternal)

Current repo state includes:

- Shield oracle hardening (`fail-closed` policies in production)
  - rate-limit Redis unavailable => fail-closed
  - replay store Redis unavailable => fail-closed
  - provider allowlist required in production
- Hub decision engine with behavior signals
  - scenario-aware signals from telemetry summaries
  - risk signal merge into quote decisions (`allow | step_up | block`)
- Shadow-mode behavior lab (`/lab`)
  - playable story/case/daily/pressure routes
  - telemetry ingest + shadow decision record APIs
  - no user-flow blocking in lab mode
- Plugin Contract V1
  - stable output schema for integrators
  - contract tests + smoke script

## Reviewer Quick Start (Recommended)

Run this exact path:

```bash
yarn install --frozen-lockfile
yarn run ci:gate
yarn run build
yarn run dev
```

Then open:

- `http://localhost:3000/lab`
- `http://localhost:3000/fan-pass`
- `http://localhost:3000/api/lab/shadow/records?limit=20`

## Evidence Path (Optional, 3-5 minutes)

If you want deeper technical proof quickly:

```bash
yarn run test:shield:hardening
yarn run test:hub
yarn run test:plugin:ticket
SHIELD_API_BASE=http://127.0.0.1:3100 yarn run smoke:plugin:ticket:v2
```

## Core Flow

1. User action enters an app or plugin flow such as `buy`, `claim`, or `unlock`.
2. The app requests a Shield quote and receives `payload_hex`, `oracle_signature_hex`, and `oracle_pubkey`.
3. The client builds a two-instruction Solana transaction: `Ed25519 verify` plus `preview/execute`.
4. The on-chain program verifies the signed payload, applies fairness policy, and emits events for monitoring and governance.

## Integration Contract

Standard Shield response fields:

- `payload_hex`
- `oracle_signature_hex`
- `oracle_pubkey`

Plugin decision contract and semantics:

- `docs/v2/PLUGIN_CONTRACT_V1.md`
- `examples/anti-bot-ticket-plugin/index.js`

## Repository Map

- v2 on-chain program: `programs/unforgiven_v2`
- Shield oracle: `services/shield-oracle`
- Fan-pass hub decision layer: `services/fan-pass-hub`
- Behavior lab engine: `services/behavior-lab-engine`
- Sentinel: `crates/sentinel`
- v2 docs: `docs/v2`
- lab docs: `docs/lab`

## Docs

- v2 docs index: `docs/v2/README.md`
- execution flow: `docs/v2/EXECUTION_FLOW.md`
- ops runbook: `docs/v2/OPS_RUNBOOK.md`
