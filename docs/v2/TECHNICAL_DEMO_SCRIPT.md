# UNFORGIVEN v2 — 2–3 Minute Technical Demo Script (Guarded Claim)

Use this script to record the Colosseum technical demo. Keep it to 2–3 minutes; focus on **Guarded Claim** and Solana integration.

**Recording stability:** For recording stability, the demo can use a pre-signed Shield quote fixture (`NEXT_PUBLIC_DEMO_QUOTE_MODE=fixture`) while keeping on-chain verification and execution fully live (Ed25519 verify + execute_shield → devnet tx → Explorer). The page shows “Quote source: Pre-signed fixture for demo stability” when so configured.

---

## [0:00–0:25] Problem & what we built

- “High-heat Solana mints and claims get botted. UNFORGIVEN is a fairness middleware: every execution is guarded by a signed attestation from our Shield oracle and verified on-chain.”
- “We’re showing one path: **Guarded Claim** — request a quote, get a signed payload, build the Solana transaction, and execute on devnet.”

---

## [0:25–0:50] Why we prioritized these features

- “We prioritized **signed payloads** so the chain never trusts the client — only the oracle’s Ed25519 signature.”
- “A **plugin contract** gives integrators a stable schema: payload_hex, oracle_signature_hex, oracle_pubkey.”
- “**Fail-closed hardening** in production: if rate-limit or replay store is down, we don’t issue quotes. That’s why you see a clear allow/block from Shield before any chain execution.”

---

## [0:50–1:35] Demo flow (screen: /demo/guarded-claim)

- “This is the demo page: Guarded Claim.”
- “I connect my Solana wallet. The page shows Recording status and Quote status; when it says ‘Ready to record (devnet)’ or ‘Local validator mode (ready)’, the quote is in — payload_hex, oracle signature, oracle pubkey.”
- “I click Claim. The client builds a Solana transaction: Ed25519 verify then execute_shield; we submit to devnet.”
- “Recording status becomes Success. Here’s the transaction signature; I open it on Solana Explorer so you can see it’s a real on-chain execution.” (If local validator: “Page shows ‘Local validator run’ — same flow on devnet.”)

---

## [1:35–2:00] Solana’s role

- “Solana is the **verification and execution layer**. The program checks the oracle’s signature and the payload (expiry, scoring model, user). No execution without a valid signed payload. That’s how we keep high-heat mints and claims fair without baking custom anti-bot logic into every app.”

---

## [2:00–2:30] Optional: one line on what’s live

- “This run is on devnet; program and config accounts are live. Details and Program ID are in docs/v2/DEPLOYMENT_STATE.md.”  
  (If you used a local validator instead: “This run was against a local validator; the same flow works on devnet with the deployed program.”)

---

## Time total: ~2–3 minutes

- Problem + what we built  
- Why signed payload / plugin contract / fail-closed  
- Live demo: connect → quote → claim → Explorer  
- Solana as verification + execution layer  
- What’s live (devnet vs local)
