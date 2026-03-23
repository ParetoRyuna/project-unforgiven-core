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

## Devnet Deploy

Use Solana `devnet` for app deployment and wallet airdrops. The repo now includes a single-path deploy flow for `unforgiven_v2`.

```bash
cp .env.example .env.local
# set ORACLE_KEYPAIR_PATH or ORACLE_PRIVATE_KEY first
npm run deploy:devnet:v2
```

What it does:

- builds `unforgiven_v2`
- deploys it to devnet with the current Solana wallet
- syncs `NEXT_PUBLIC_PROGRAM_ID` and devnet RPC settings into `.env.local`
- initializes `global_config_v2` and `admin_config_v2`

## Verified Devnet State (2026-03-23)

The current public devnet deployment has been re-verified against chain state on **2026-03-23**.

- **Program ID:** `5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW`
- **Upgrade authority:** `EhTPPwYGDW1KEn1jepHArxGzvVtfo5KBEBfBEFc66gBo`
- **global_config_v2:** `Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu`
- **admin_config_v2:** `BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo`
- **initializeV2 tx:** `5z4B2Zm1LjSiUMwTdvykMegB4sksqZx3fnqSQ6rzKqodAQhKFPLCBBSYET4NNiXPo4zQSBJcp578JakLsiFLgFSV`
- **initializeAdminConfig tx:** `4PNaXCeoUg1LZux42dvyKGQBgPnjmfhdhq8geX23iumNtpBPgseuQ1KfnaVjo2xUniwHDFoELRBhEiukrfiTzK2c`

Quick re-check commands:

```bash
solana program show 5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW --url devnet
solana account Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu --url devnet
solana account BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo --url devnet
solana confirm -v 5z4B2Zm1LjSiUMwTdvykMegB4sksqZx3fnqSQ6rzKqodAQhKFPLCBBSYET4NNiXPo4zQSBJcp578JakLsiFLgFSV --url devnet
solana confirm -v 4PNaXCeoUg1LZux42dvyKGQBgPnjmfhdhq8geX23iumNtpBPgseuQ1KfnaVjo2xUniwHDFoELRBhEiukrfiTzK2c --url devnet
```

Full deployment notes live in `docs/v2/DEPLOYMENT_STATE.md`.

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

## Technical Demo Flow (Guarded Claim)

The **Colosseum technical demo** uses a single path: **Guarded Claim** — Connect wallet → Shield quote → signed payload → Claim → Ed25519 verify + execute_shield → devnet tx → Explorer proof.

- **Demo page:** `http://localhost:3000/demo/guarded-claim`
- **Page states:** Recording status (Ready to record / Blocked / Quote unavailable / Local validator mode), Quote status, Execution status, Claim button, Transaction signature, Explorer link (devnet) or “Local validator run” (local).
- **Flow:** Connect wallet → wait until **Recording status** is “Ready to record (devnet)” or “Local validator mode (ready)” → click **Claim** → approve in wallet → see Transaction signature and **View on Solana Explorer** (or local run message).
- **Docs:** `docs/v2/DEMO_RUNBOOK.md` (runbook), `docs/v2/TECHNICAL_DEMO_SCRIPT.md` (2–3 min script).

**Env:** `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, and `ORACLE_KEYPAIR_PATH` or `ORACLE_PRIVATE_KEY` in `.env.local`. Chain must be initialized (see runbook). **Local validator fallback:** if devnet is down, use local validator and set `NEXT_PUBLIC_DEMO_EXPLORER_LINK=0`; page will show “Local validator run” and runbook describes the steps.

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
