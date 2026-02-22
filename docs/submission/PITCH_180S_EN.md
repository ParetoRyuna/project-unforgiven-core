# UNFORGIVEN v2 — 180s Pitch Script (EN)

Use this as the default 3-minute judge/demo script. Keep the message on one product: universal fairness middleware.

## 0-30s: Problem

Script:

> High-velocity Solana launches are where bots win fastest. Static allowlists and static pricing do not adapt to burst behavior, so real users get worse access and worse execution. We built UNFORGIVEN v2 as a fairness middleware that makes launch abuse harder to profit from while keeping integration simple for apps.

What to show:
- README one-liner + problem section

## 30-75s: Mechanism (What is new)

Script:

> UNFORGIVEN v2 returns a deterministic signed payload from a Shield API, then the client submits a two-instruction transaction: Ed25519 verification plus our program instruction. On-chain, we verify the exact signature/message path using instruction introspection. We also separate preview from execute so UX can quote repeatedly, but proof usage is consumed once on the execution path.

What to show:
- architecture diagram
- mention 141-byte payload contract

## 75-120s: Why it is middleware (not a single app demo)

Script:

> The key point is this is not just a ticketing app. The same shield-first contract can sit in front of buys, claims, unlocks, or gated consumer actions. We provide a fixed integration surface: payload, oracle signature, and a two-instruction tx pattern, plus an SDK and plugin example.

What to show:
- SDK path
- payload spec path
- example plugin path
- briefly mention fan-pass / hide-sis as demo verticals

## 120-165s: Proof of reliability (show evidence)

Script:

> We built an ops-grade validation path, not only a demo UI. Our strict gate boots the stack, runs a burst preview sequence, confirms sentinel governance action, executes admin reset, and validates a post-reset preview. It outputs a structured JSON report with signatures and state hash checks so reviewers can verify the incident-response loop.

What to show:
- `npm run gate:all`
- `/tmp/wanwan-ops-smoke-report.json`
- fields: `result`, `governance_tx_signature`, `reset_tx_signature`, `hash_changed_before_reset`

## 165-180s: Close / Ask

Script:

> We are looking for pilot launch integrations on Solana. The product is ready for pilot-level validation now: protocol path, monitoring loop, and recovery flow are implemented. Next step is production deployment hardening plus real launch traffic.

## Judge Q&A Guardrails (Do Not Drift)

If asked about examples:
- Say: "Those are demo verticals proving the middleware is portable."
- Do not say: "We are also building three separate products."

If asked what is unique:
- Say: "On-chain enforceable fairness path plus operational recovery proof."
- Do not lead with UI.
