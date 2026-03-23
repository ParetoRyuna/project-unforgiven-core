# UNFORGIVEN v2

On-chain fairness execution for high-demand Solana launches.

UNFORGIVEN v2 is built around one core idea: combine `VRGDA` pricing pressure with `zkTLS`-backed identity proofs, then carry that decision all the way into a signed, verifiable on-chain execution path.

This is not just a frontend anti-bot filter.
It is a full pipeline:

`zkTLS / Reclaim proof -> dignity score -> VRGDA quote -> oracle-signed payload -> Ed25519 verify -> execute_shield -> one-time proof consumption on-chain`

## Why This Matters

High-demand launches fail in predictable ways:

- bots can spam faster than humans
- static allowlists are easy to bypass
- off-chain risk checks are hard to trust at execution time
- even good scoring systems fail if the final on-chain action does not enforce the same decision

UNFORGIVEN v2 closes that gap by turning identity-aware pricing and access logic into a signed payload that the Solana program re-verifies before execution.

## Core Innovation

### 1. VRGDA as a fairness valve, not just a sales curve

In `programs/unforgiven_v2/src/unforgiven_math.rs`, price is not only a function of time and velocity.
It is also weighted by identity quality:

- low dignity score -> much higher effective velocity pressure
- high dignity score -> lower final price and better access
- extreme heat -> infinite / blocked path instead of silently allowing extraction

This creates a useful split:

- suspected bots get pushed toward punitive pricing or outright block
- verified humans remain near the intended price band

### 2. zkTLS proofs become execution inputs, not marketing claims

The oracle path verifies wallet-bound `zkTLS` / `Reclaim` attestations, hashes the proof bundle, and embeds that hash into a fixed-width Shield payload.

That payload includes:

- `user_pubkey`
- `zk_proof_hash`
- `scoring_model_hash`
- `attestation_expiry`
- `nonce`
- VRGDA quote inputs and mode flags

The important part is not just proof verification off-chain.
The important part is that the proof hash is carried into the on-chain execution path and tied to one-time consumption.

### 3. Full-chain enforcement instead of “score off-chain, trust me”

`execute_shield` in `programs/unforgiven_v2/src/lib.rs` re-checks the same signed payload on-chain and creates a `ProofUse` PDA derived from:

- `user_pubkey`
- `zk_proof_hash`
- `nonce`

That means the fairness decision is not only computed off-chain, it is enforced on-chain with replay resistance.

## What Makes This Different

Most launch protection stacks do one of these:

- block at the UI layer
- run off-chain scoring with no verifiable execution guarantee
- use identity proofs for gating, but not for dynamic price formation
- use dynamic pricing, but not identity-bound proof consumption

UNFORGIVEN v2 combines all four layers in one path:

1. `zkTLS` attestation proves something about the user without exposing raw credentials
2. dignity scoring turns that signal into a machine-readable trust weight
3. `VRGDA` transforms trust + heat into a price / block decision
4. Solana enforces that exact signed decision on-chain

That `VRGDA + zkTLS + signed payload + on-chain proof consumption` composition is the main novelty of this repo.

## Colosseum Reviewer Path

Run:

```bash
yarn install --frozen-lockfile
yarn run ci:gate
yarn run build
yarn run dev
```

Then open:

- `http://localhost:3000/demo/guarded-claim`

What to look for:

1. Connect wallet
2. Wait for quote readiness
3. Execute claim
4. Observe signed payload flow and transaction success
5. Open Solana Explorer proof on devnet

If you want the exact recording flow, use `docs/v2/DEMO_RUNBOOK.md`.

## Technical Demo

The primary demo is `Guarded Claim`.

User path:

1. wallet connects
2. app requests Shield quote
3. oracle returns `payload_hex`, `oracle_signature_hex`, `oracle_pubkey`
4. client builds `Ed25519Program` verify + `execute_shield`
5. program re-verifies the payload and consumes the proof tuple once
6. transaction lands on devnet and can be inspected in Explorer

The demo page is:

- `http://localhost:3000/demo/guarded-claim`

## Verified Devnet State

Re-verified on `2026-03-23`:

- Program ID: `5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW`
- Upgrade authority: `EhTPPwYGDW1KEn1jepHArxGzvVtfo5KBEBfBEFc66gBo`
- `global_config_v2`: `Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu`
- `admin_config_v2`: `BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo`
- `initializeV2` tx: `5z4B2Zm1LjSiUMwTdvykMegB4sksqZx3fnqSQ6rzKqodAQhKFPLCBBSYET4NNiXPo4zQSBJcp578JakLsiFLgFSV`
- `initializeAdminConfig` tx: `4PNaXCeoUg1LZux42dvyKGQBgPnjmfhdhq8geX23iumNtpBPgseuQ1KfnaVjo2xUniwHDFoELRBhEiukrfiTzK2c`

Quick checks:

```bash
solana program show 5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW --url devnet
solana account Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu --url devnet
solana account BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo --url devnet
```

Full notes: `docs/v2/DEPLOYMENT_STATE.md`

## Devnet Deploy

```bash
cp .env.example .env.local
# set ORACLE_KEYPAIR_PATH or ORACLE_PRIVATE_KEY first
npm run deploy:devnet:v2
```

This flow:

- builds `unforgiven_v2`
- deploys to Solana devnet
- syncs program id and RPC settings into `.env.local`
- initializes `global_config_v2` and `admin_config_v2`

## Evidence

Recommended validation commands:

```bash
yarn run test:shield:hardening
yarn run test:client:v2
yarn run test:hub
yarn run test:plugin:ticket
yarn run test:program:negative:v2
```

These cover:

- oracle hardening / fail-closed behavior
- v2 client and payload alignment
- hub integration path
- plugin contract behavior
- negative execution-path checks in the program

## Repo Map

- on-chain program: `programs/unforgiven_v2`
- oracle / quote issuance: `services/shield-oracle`
- v2 client helpers: `lib/unforgiven-v2-client.ts`
- guarded claim demo: `app/demo/guarded-claim/page.tsx`
- demo runbook: `docs/v2/DEMO_RUNBOOK.md`
- execution flow: `docs/v2/EXECUTION_FLOW.md`
- architecture notes: `docs/v2/ARCHITECTURE.md`

## Additional Surfaces

The repository also contains optional modules beyond the main Colosseum path:

- `/fan-pass` for integrator-facing decision flow experiments
- `/lab` for shadow-mode behavioral scenarios and telemetry
- ticket receipt / listing primitives in `unforgiven_v2` for post-primary lifecycle experiments

These are secondary to the main claim:

`UNFORGIVEN v2 demonstrates that VRGDA + zkTLS can be composed into a verifiable, replay-resistant, on-chain fairness execution path on Solana.`
