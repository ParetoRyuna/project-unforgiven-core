# UNFORGIVEN v2 — Colosseum Technical Demo Script

Target length: 2 to 3 minutes.

## 0:00 - 0:30

“Most anti-bot systems stop at off-chain scoring. UNFORGIVEN takes a different route: we combine zkTLS identity proofs with VRGDA pricing, sign that decision, and enforce the same payload on-chain.”

## 0:30 - 1:00

“The core novelty is the full path: zkTLS or Reclaim proof, dignity scoring, VRGDA quote, oracle-signed payload, Ed25519 verification, then `execute_shield` on Solana.”

## 1:00 - 1:45

“Here is the Guarded Claim demo. I connect my wallet, the app requests a quote, and the oracle returns `payload_hex`, `oracle_signature_hex`, and `oracle_pubkey`.”

“Now I click Claim. The client builds a transaction with Ed25519 verification plus `execute_shield`, and submits it to devnet.”

## 1:45 - 2:15

“The important part is that Solana re-checks the exact signed payload before execution. This is not just UI gating or an API score. The chain enforces the decision.”

## 2:15 - 2:40

“After success, I open Solana Explorer to show the real devnet transaction. That closes the loop: proof-informed pricing, signed payload, and on-chain execution all in one path.”

## Optional Closing Line

“UNFORGIVEN shows that VRGDA plus zkTLS can be composed into a replay-resistant fairness execution layer for Solana launches.”
