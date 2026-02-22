# UNFORGIVEN v2 — Eternal Submission Draft (EN)

Use this file as copy-ready material for Colosseum Eternal / hackathon submission forms. Each section includes a short version (tight form fields) and a longer version (application essays / deck notes).

## Project Name

UNFORGIVEN v2

## One-liner

### Short
UNFORGIVEN v2 is a universal fairness middleware for high-velocity Solana launches.

### Long
UNFORGIVEN v2 is a Solana-native fairness middleware that combines zkTLS-backed user weighting, on-chain verifiable authorization, and incident-response guardrails to reduce bot extraction during high-velocity launches.

## Problem

### Short
Fast launches are dominated by bot bursts and MEV-style extraction, causing unfair access and distorted price discovery for real users.

### Long
In high-velocity launches, the first few hundred milliseconds decide allocation and price. Static allowlists and static pricing do not adapt to burst behavior, so bots can absorb supply quickly and extract value from real users. Teams need a fairness layer that can be integrated into launch flows without trusting only frontend checks or centralized manual moderation.

## Solution

### Short
We provide a shield-first middleware that returns a deterministic signed payload and enforces the decision on-chain through Ed25519 verification + program-level instruction introspection.

### Long
UNFORGIVEN v2 sits in front of a launch action (buy / claim / unlock). The app calls Shield API to obtain a quote decision and a deterministic 141-byte payload signed by an oracle. The client submits a two-instruction transaction (`Ed25519Program` verify + UNFORGIVEN program instruction). On-chain logic verifies the prior Ed25519 instruction and applies fairness policy. `preview_price` is reusable for UX, while `execute_shield` consumes proof usage once via PDA to prevent replay on the execution path.

## Why Solana

### Short
Solana’s throughput and low latency make it the exact environment where fairness breaks first and where on-chain enforceable guardrails matter most.

### Long
The launch patterns we target depend on high concurrency and fast settlement, which is exactly where Solana excels and where bot bursts become most damaging. Solana also supports the transaction composition model we use (`Ed25519Program` + program instruction) with strong observability for monitoring and automation. Our sentinel/governance loop is designed around real-time log-driven detection and reaction, which benefits from Solana’s performance characteristics.

## Technical Moat / Novelty

### Short
Our novelty is the combination of zkTLS identity weighting, deterministic payload signing, on-chain Ed25519 instruction introspection, and an ops-grade governance recovery loop.

### Long
Many anti-bot approaches stop at frontend filtering or centralized API decisions. UNFORGIVEN v2 pushes enforcement into a verifiable transaction path: deterministic payload serialization (141 bytes), signed authorization, on-chain validation of the exact signature/message, and preview/execute path separation for replay resistance. We also include a sentinel service that detects burst patterns and triggers governance updates, plus a validated reset flow and smoke report to prove recovery.

## What Is Working Today (Evidence)

### Short
We have a working local end-to-end stack with strict acceptance (`npm run gate:all`) that verifies burst -> governance trigger -> reset -> post-reset preview.

### Long
The repository includes a strict gate (`npm run gate:all`) that runs code checks, API/SDK/program tests, and a full ops smoke. The smoke boots local validator + deployed program + Next API + sentinel, runs a preview burst, confirms governance action submission, executes admin reset, and validates post-reset preview. It emits a structured JSON report with signatures and state-hash checks for review.

## Integration Surface / Developer Experience

### Short
External apps integrate through a fixed 141-byte handshake (`payload_hex`, `oracle_signature_hex`, `oracle_pubkey`) and a two-instruction transaction model.

### Long
UNFORGIVEN v2 is designed as middleware, not a single app. Apps request a shield quote and receive a deterministic payload and oracle signature. The client submits `Ed25519Program.verify` plus UNFORGIVEN preview/execute instruction. We provide a JS SDK, payload spec docs, and an example plugin integration to minimize integration effort.

## Demo Verticals (Examples)

### Short
We demonstrate the same middleware across multiple verticals (ticketing, fan pass flows, narrative/gated experiences) to show generality.

### Long
The repo contains multiple demo surfaces that use the same fairness primitives in different contexts. These are examples to prove portability of the middleware, not separate product lines. Our main submission narrative remains universal fairness middleware for launch and access flows.

## Traction / Validation (Fill Before Submission)

### Short
Current validation is technical reliability + demo evidence. We are collecting external integration interest.

### Long
Today we have strong technical validation (end-to-end reliability gate, ops smoke report, structured logs, security hardening defaults). Before final submission, we should add at least one external signal (pilot integrator, plugin trial, partner call, or usage screenshot) to convert this from “strong technical prototype” into “validated infrastructure product.”

Recommended additions before submit:
- 1 pilot integration intent (name or anonymized profile)
- 1 screenshot/log of external plugin using the 141-byte handshake
- 1 statement of target user (launchpad team / NFT launch operator / token launch infra)

## Go-To-Market

### Short
We start with launchpads and high-velocity token/NFT drops, then expand to any gated action that needs shield-first routing.

### Long
Initial GTM focuses on launch operators who already suffer from burst attacks, unfair allocation complaints, and bot extraction. UNFORGIVEN v2 can be integrated as a middleware layer without replacing existing business logic. After proving launchpad use cases, the same integration contract extends to claims, unlocks, allowlists, and consumer access gating with differentiated risk policies.

## Team (Fill In)

### Short
[Add founder/team summary here]

### Long
[Add relevant Solana, backend, security, or product experience here. Include why your team is credible to ship infra + operate it.]

## What We Need / Next Milestones

### Short
Pilot integrations, production deployment hardening (shared infra/KMS), and mainnet traffic validation.

### Long
Next milestones are: (1) pilot integrations with real launch flows, (2) production deployment hardening including shared replay/rate-limit backends and managed keys, and (3) traffic validation on real launch bursts. The current codebase already includes the protocol path, monitoring loop, and recovery flow required to start those pilots.
