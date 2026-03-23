# Shadow Mode Pilot Report (One-Page)

## 1) Pilot Summary

- Partner:
- Event name:
- Event type: (`token_launch` / `claim` / `whitelist_claim` / `gated_access`)
- Event date (UTC):
- Pilot mode: `shadow_mode (observe_only)`
- Integration option: (`Option A: event mirror` / `Option B: API-assisted scoring`)
- Runtime window:

## 2) Objectives (What We Tried to Validate)

- Detect burst/anomaly windows without affecting execution path
- Identify suspicious repeated behavior / concentration patterns
- Produce actionable next-step recommendations for the next event

## 3) Scope and Guardrails

- No blocking / no request denial
- No transaction path changes
- No custody / no private key sharing
- Rollback method (if needed): remove webhook/API call

## 4) Event Snapshot (High-Level Metrics)

- Total requests observed:
- Unique wallets observed:
- Successful executions (if available):
- Failed requests (if available):
- Peak requests/minute:
- Peak burst timestamp (UTC):

## 5) Key Findings

### Finding A: Burst Window(s)
- Window ID:
- Time range (UTC):
- Why it matters:

### Finding B: Suspicious Repetition / Cluster Behavior
- Pattern observed:
- Confidence (low/med/high):
- Impact on distribution quality:

### Finding C: Distribution Distortion Indicators (Optional)
- Concentration signal:
- Repeat-attempt signal:
- Route-level anomaly:

## 6) What Was Invisible Before (If Applicable)

- Example:
- Why raw logs alone were insufficient:

## 7) Recommendations for Next Event (Prioritized)

1. Keep shadow mode and collect one more event
2. Enable soft execution alerts for specific route(s)
3. Add selective policy controls (small scope only)
4. Improve partner-side logging fields (list exact fields)

## 8) Suggested Next Pilot Configuration

- Next event type:
- Next pilot mode: (`shadow_mode` / `soft_execution_alerts`)
- Proposed scope limits:
- Proposed rollout date:

## 9) Success Criteria Outcome

- [ ] Identified meaningful anomaly windows
- [ ] Produced actionable next-step recommendations
- [ ] Ran without impacting uptime / UX
- [ ] Partner wants follow-up pilot

## 10) Appendix (Optional Quick Stats)

- Example anomalous request IDs:
- Example tx signatures (if shareable):
- Notes on data quality gaps:
