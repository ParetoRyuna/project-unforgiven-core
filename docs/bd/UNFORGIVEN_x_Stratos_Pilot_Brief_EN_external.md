UNFORGIVEN v2 × Stratos Vault Joint Proposal

Version: v0.3 (EN translation)
Date: 2026-02-24

1. UNFORGIVEN v2 Product Overview

UNFORGIVEN v2 is positioned as a fairness execution middleware for high-concurrency scenarios.  
It mainly addresses the core problems in high-demand flows:

Bots / scripts crowd out real users and reduce success rates.
Static rules are easy to bypass (frontend checks, simple rate limiting, fixed allowlists).
Teams often lack a fairness control layer that is both explainable and executable.

Direct value to Stratos (product / commercial layer)

1) Strengthens Dock Apps / scenario differentiation
Adds a fairness execution layer on top of "wallet + signing + multi-chain" capabilities.
Externally, Stratos can present not only secure access/signing, but also fair allocation / access control for high-demand scenarios.

2) Supports high-demand scenarios (claim / subscription / gated access)
These scenarios are more likely to see abuse and congestion.
They are also where fairness policy + execution constraints are most valuable.

3) Reduces the cost for each app team to build anti-bot logic by themselves
Teams do not need to repeatedly rebuild segmentation, risk checks, decision logic, and recovery logic.
A middleware integration model is easier to standardize and reuse at the platform level.

4) Creates a reusable joint solution
`Stratos Vault = wallet / account / signing platform layer`
`UNFORGIVEN v2 = fairness allocation / execution layer`
This is easier to present externally as a complete solution rather than a single feature.
The value is not just adding an anti-bot feature, but helping Stratos build a differentiated position in "fair execution for high-demand scenarios" on top of its wallet/platform capabilities.

2. Technical Capability Summary

2.1 Technical Positioning

UNFORGIVEN v2 is a fairness execution middleware for high-concurrency business flows, with core capabilities including decision output, authorization payloads, execution constraints, and a monitoring/governance loop.

2.2 Input / Output

This section can be understood as "how the integration works at a high level."

At key flow steps (for example claim / gated access / subscription), the integrating service sends request information to UNFORGIVEN, for example:

User identifier (such as wallet address / account identifier)

Scenario type (claim / gated access / subscription, etc.)

A small amount of required scenario context

If identity/proof signals exist (for example Reclaim proof or app-side signals), they can be sent together

UNFORGIVEN returns to the business flow:

Decision recommendation (`allow / step-up / block`)

High-level reason code (for explanation and analytics)

Scenario-dependent TTL information or authorization payloads (for downstream execution)

2.3 Current Capability Status

Fairness decision chain: operational

Authorization payload + signature chain: operational (Shield payload + signature)

On-chain verifiable execution path: implemented on the Solana main path with a relatively complete flow

Monitoring / governance loop: basic capability is in place (Sentinel)

Reclaim server-side verification path: integrated and usable for development-time integration testing

2.4 Integration Approaches

For phase one, any of the following can be used depending on the existing architecture:

1) Backend API call (recommended)
The partner business flow calls the UNFORGIVEN fairness layer at key steps.
UNFORGIVEN returns a decision and high-level reason code.

2) Dock App backend callback / service call
Suitable for Stratos Vault's application hosting model.
The scenario service calls the fairness decision point at key actions.

3) Hybrid integration (phase two)
Start with API decisions, then add deeper execution constraints / authorization consumption.

2.5 What Is Not Shared at This Stage

To keep execution efficient and protect both sides' investment, the following are better shared only after the pilot scenario and owner are confirmed:

Detailed strategy thresholds / scoring formulas

Complete field contract and encoding details

Internal governance parameters and tuning logic

Code-level details that would directly reveal core implementation logic

3. How This Differs from a Typical Risk API

From a product capability perspective, UNFORGIVEN v2 differs in the following ways:

1) It does not only return a risk score
It returns decision recommendations and execution guidance that can be used directly in a business flow (`allow / step-up / block`).

2) It does not only apply frontend / API-layer rules
Its goal is to move key fairness constraints into a more verifiable and harder-to-bypass execution path (the Solana main path already has a relatively complete implementation).

3) It is not only about "blocking"
It supports staged rollout (for example shadow → small-volume step-up → small-volume enforcement).

4) It is not a one-off custom script
It is designed to be integrated as middleware and reused as a platform capability.

4. Fit with Stratos Vault

Based on the public documentation, my understanding is that Stratos Vault's strengths include:

Enterprise wallet infrastructure (multi-chain, accounts, signing, platform entry)

WebAuthn / MPC security model

White-label and multi-instance deployment capability

Dock Apps hosting and SDK capability

UNFORGIVEN v2 fits as:

Stratos Vault provides: user entry + wallet signing + platform hosting

UNFORGIVEN provides: fairness allocation / access control / execution control

5. Best Scenarios to Validate First

Suggested priority order:

1. Gated Access
Lower integration cost and very clear value expression (fair access + step-up mechanism)

2. Claim
Anti-bot value is the most intuitive and easy to observe in hit distribution

3. Subscription / Allocation
High commercial value and fits Canton / compliance narratives well (but higher complexity)

6. Joint Pilot Proposal

6.1 Goal

First validate whether the joint solution can provide, in a target scenario:

Meaningful fairness decisions (reasonable hit distribution)
Acceptable performance overhead (latency under control)
A reusable integration path (not a one-off custom integration)

6.2 Shadow Mode

For phase one, a real integrated Shadow Mode is recommended because:

It does not directly change user outcomes, so risk is low
It can quickly produce real / near-real data to decide whether control flow should be enabled later
It helps both sides align on metrics and scenario value faster

Shadow Mode here is a pilot method, not the product value itself.

7. High-Level Joint Architecture

1) Users enter the target scenario through Stratos Vault (Dock App / platform business flow)
2) The business flow sends the minimum required context to the UNFORGIVEN fairness layer
3) UNFORGIVEN returns a decision recommendation (`allow / step-up / block`) and high-level reason code
4) In phase one, record joint decision outcomes and metrics (Shadow Mode)
5) Use the data to decide whether to move into small-volume enforcement

8. Joint Pilot Acceptance Criteria

This section is used by both sides to decide whether the pilot is worth moving into the next stage, not as a one-sided internal evaluation.
Suggested alignment is based on these four result categories:

A. Business value signals

High-risk / suspicious request ratio (by scenario)
Decision distribution (`allow / step-up / block`)
Strategy hit rate in the target scenario

B. Potential value for Stratos scenarios (Shadow projection)

If enabled, estimated scale of requests that would be blocked / stepped up
Whether a "high-demand problem" can be converted into a controllable segmented flow

C. Integration and runtime cost

Response latency (p50 / p95)
Integration overhead (engineering complexity, number of required fields)

D. Business risk acceptability (false positives)

Sample review of `step-up / block` decisions
Assess whether false-positive risk is within an acceptable range

9. Roles (Suggested)

Stratos Vault

Select the first pilot scenario

Provide a minimal integration path (API / Dock App / callback)

Provide at least one of the following: test environment, sample traffic, or log access method

UNFORGIVEN v2

Provide the fairness decision chain and high-level decision outputs

Provide metric templates and pilot evaluation method

Based on pilot data, provide recommendations for phase two (small-volume enforcement)

10. Next Step

If this direction looks interesting, the next discussion can focus on:

The first pilot scenario (Gated Access / Claim / Subscription)

Two-week pilot scope and acceptance criteria

Start with one scenario first, not multiple scenarios in parallel
