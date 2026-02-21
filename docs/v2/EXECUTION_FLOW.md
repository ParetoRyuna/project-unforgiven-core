# UNFORGIVEN v2 Execution Flow

## Goal
Separate read-only quote preview from one-time proof consumption.

## Flow
1. `preview_price(payload, oracle_signature)`
- Verifies policy, expiry, scoring model hash, oracle signature, and `tx signer == payload.user_pubkey`.
- Emits quote event only.
- Does **not** create `ProofUse`.

2. `execute_shield(payload, oracle_signature)`
- Re-runs the same validation rules.
- Rejects blocked/infinite quote path.
- Creates `ProofUse` PDA with seeds:
  - `["proof_use", user_pubkey, zk_proof_hash, nonce_le]`
- Marks the attestation tuple as consumed once.

## Security Effect
- Preview can be called repeatedly for UX.
- Execute is one-time per `(proof_hash + user + nonce)`.
- This closes replay and "dignity transport" reuse on the execution path.

## Version Boundary
- This design is **v2 only** (`/Users/lenovo/Desktop/HACKTHON PROJECT/programs/unforgiven_v2`).
- Do not backport execution-path logic into v1 (`/Users/lenovo/Desktop/HACKTHON PROJECT/programs/unforgiven`).
