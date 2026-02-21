# UNFORGIVEN Version Map

## Purpose
Use this file as the single source of truth to avoid mixing UNFORGIVEN v1 and v2 during the sprint.

## Version Routing
- `v1` (ticketing app): `/Users/lenovo/Desktop/HACKTHON PROJECT/programs/unforgiven`
- `v2` (universal middleware): `/Users/lenovo/Desktop/HACKTHON PROJECT/programs/unforgiven_v2`
- `v2 SDK` (2-line integration target): `/Users/lenovo/Desktop/HACKTHON PROJECT/packages/universal-shield-sdk`
- `v2 Backend Services`: `/Users/lenovo/Desktop/HACKTHON PROJECT/services` (`shield-oracle` for 签名/防重放 + `dignity-scoring` for GitHub/Spotify/Twitter adapters)
- `v2 Demo`: `/Users/lenovo/Desktop/HACKTHON PROJECT/apps/kickstart-demo`
- `v2 Specs`: `/Users/lenovo/Desktop/HACKTHON PROJECT/docs/v2`

## Naming Rules
- Rust crate names must include version suffix when protocol changes: `unforgiven`, `unforgiven_v2`.
- New docs for v2 must be placed under `docs/v2/`.
- New SDK code for external integrators goes only into `packages/universal-shield-sdk/`.
- New v2 backend logic goes only into `services/` (keep `app/api/*` as thin wrappers).
- Do not add v2 logic into `programs/unforgiven/` unless it is a deliberate backport.
- v2 execution/replay-protection logic (`execute_shield` + `ProofUse` PDA) stays only in `programs/unforgiven_v2/`.

## Fast Commands
- Build v1 program: `npm run build:program:v1`
- Build v2 program: `npm run build:program:v2`
- Check v2 Rust compile: `npm run check:program:v2`
- Open this map: `npm run docs:versions`
