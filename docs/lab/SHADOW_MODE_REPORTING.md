# Shadow Mode Reporting (MVP)

## Definition
Shadow Mode means the system computes risk decisions but does not block or step-up the user flow.

## Default Behavior (Lab MVP)
- All `/lab` entries run with `shadow_mode = true`.
- Back-end records scoring output on challenge submit.
- Front-end still reveals result content regardless of `would_block` / `would_step_up`.

## Stored / Logged Fields
- `decision_shadow`
- `would_block`
- `would_step_up`
- `human_confidence`
- `model_layer_breakdown`
- `reason_codes`
- `sample_eligible`
- `label_status` (default `unknown`)
- `review_notes` (optional, future)

## MVP Threshold Defaults
### Narrative
- `>= 80`: sample eligible
- `50-79`: allow but not sample eligible
- `< 50`: would_step_up
- severe anomalies + wrong quiz: may `would_block`

### Pressure Simulation
- Good click window + low retries + stable focus: higher confidence
- Excess retries / far-off click timing / frequent focus switching: lower confidence
- Shadow Mode still allows progression for calibration

## Weekly Review Workflow
1. Export shadow logs (JSON file or in-memory dump during MVP).
2. Sample sessions by scenario (`narrative`, `pressure_sim`).
3. Review `reason_codes` and telemetry summaries.
4. Adjust rule thresholds conservatively.
5. Record threshold change notes in this doc or a changelog.
