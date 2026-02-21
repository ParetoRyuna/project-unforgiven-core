# UNFORGIVEN v2 Architecture (Wan Wan Web Track)

## Scope
UNFORGIVEN v2 is a universal fairness middleware, not a ticket-only app.

## Core Engines
- `Valve`: VRGDA-based pricing pressure against bot clusters.
- `Thread`: zkTLS-based non-invasive human verification.
- `Weight`: Dignity Score as a multiplier/weight in fairness policy.

## Deliverables for EasyA Sprint
- On-chain program scaffold: `programs/unforgiven_v2`
- SDK scaffold for 2-line integration: `packages/universal-shield-sdk`
- Demo scaffold: `apps/kickstart-demo`

## Guardrails
- v1 and v2 run in separate directories and separate crate names.
- v2 price logic is isolated in `unforgiven_math.rs` and can be shared by SDK logic.
