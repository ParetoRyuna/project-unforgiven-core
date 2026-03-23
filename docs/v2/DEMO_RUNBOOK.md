# UNFORGIVEN v2 — Colosseum Demo Runbook

Single-path runbook for the reviewer demo.
Primary path: `Guarded Claim` on Solana `devnet`.

## What The Reviewer Should Understand

This demo is designed to prove one claim:

`VRGDA + zkTLS + oracle-signed payload + on-chain enforcement`

The reviewer should be able to see:

1. a wallet-bound zkTLS / Reclaim proof influences the quote path
2. the quote is serialized into a signed payload
3. the client submits `Ed25519 verify + execute_shield`
4. the Solana program re-verifies the same payload on-chain
5. the proof tuple is consumed once via `ProofUse`

## Prerequisites

- Node 18+
- yarn
- Solana CLI
- `.env.local` copied from `.env.example`

Required env:

- `NEXT_PUBLIC_PROGRAM_ID`
- `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`
- `ORACLE_KEYPAIR_PATH` or `ORACLE_PRIVATE_KEY`

Optional:

- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_DEMO_QUOTE_MODE=fixture` for recording stability

## Quote Modes

| Mode | Source | Purpose |
|------|--------|---------|
| `live` | `/api/shield-score` | Full oracle path: Reclaim verification, rate limit, replay protection |
| `fixture` | `/api/demo/quote-fixture` | Stable recording mode: same payload/signature shape, lighter dependencies |

Important:

- both modes keep the same on-chain path
- both produce real `payload_hex`, `oracle_signature_hex`, `oracle_pubkey`
- only the quote source changes

## Start

```bash
yarn install --frozen-lockfile
yarn run ci:gate
yarn run build
yarn run dev
```

Open:

- `http://localhost:3000/demo/guarded-claim`

## Reviewer Flow

1. Connect a Solana wallet.
2. Wait for the page to show a ready state.
3. Observe that quote data has been loaded.
4. Click `Claim`.
5. Approve the transaction.
6. Show the resulting transaction signature.
7. Open Solana Explorer on `devnet`.

What to call out while recording:

- the app received a signed Shield payload
- the client is not trusted by itself
- the transaction includes Ed25519 verification before `execute_shield`
- the program enforces the same decision on-chain

## What To Say In One Sentence

“UNFORGIVEN does not stop at off-chain scoring; it carries zkTLS-weighted VRGDA decisions into a signed payload that Solana re-verifies before execution.”

## Devnet Proof

Re-verified deployment:

- Program ID: `5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW`
- `global_config_v2`: `Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu`
- `admin_config_v2`: `BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo`

Useful checks:

```bash
solana program show 5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW --url devnet
solana account Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu --url devnet
solana account BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo --url devnet
```

For the full state record, see `docs/v2/DEPLOYMENT_STATE.md`.

## If Quote Fails

- check `ORACLE_KEYPAIR_PATH` or `ORACLE_PRIVATE_KEY`
- for recording, switch to `NEXT_PUBLIC_DEMO_QUOTE_MODE=fixture`
- if using `live`, Redis-related guardrails may fail closed

## If Chain Execution Fails

- confirm `.env.local` matches the deployed Program ID
- confirm `admin_config_v2` and `global_config_v2` exist
- confirm the oracle key in `.env.local` matches the key used when admin config was initialized

## Local Fallback

If `devnet` is unstable:

- use `scripts/up_v2.sh`
- point RPC to local validator
- set `NEXT_PUBLIC_DEMO_EXPLORER_LINK=0`

State clearly in the recording that this is a local-validator fallback and that the intended reviewer path is still `devnet`.

## One-Line Checklist

Install -> build -> dev -> open `/demo/guarded-claim` -> connect wallet -> wait for quote -> claim -> show Explorer proof
