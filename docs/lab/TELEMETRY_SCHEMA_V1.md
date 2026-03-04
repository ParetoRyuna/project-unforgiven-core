# Telemetry Schema V1 (Shadow Mode MVP)

## Summary
`TelemetrySummaryV1` is a compact, non-PII summary payload for Lab interactions. It is used for scoring calibration and shadow-mode reporting only.

## Fields
- `schema_version` (number, required): must be `1`.
- `scenario_type` (string, required): `narrative | pressure_sim | live_shadow`.
- `session_id` (string, required).
- `story_id` (string, optional).
- `case_id` (string, optional).
- `event_id` (string, optional).
- `reading_time_ms` (number, optional, >= 0).
- `progress_ratio` (number, optional, 0..1).
- `scroll_entropy` (number, optional, >= 0).
- `focus_blur_count` (number, optional, >= 0 integer).
- `input_latency_ms` (number, optional, >= 0).
- `retry_count` (number, optional, >= 0 integer).
- `queue_wait_ms` (number, optional, >= 0).
- `countdown_to_click_ms` (number, optional; can be negative for early click attempts if client sends raw, server should normalize per scenario).
- `quiz_correct` (boolean, optional).
- `quiz_answer_id` (number, optional).
- `consent_mode` (string, optional): `diegetic_opt_in | summary_only`.
- `client_ts` (number, optional).
- `telemetry_hash` (string, optional): client-provided checksum, server may ignore/recompute.

## Validation Rules (MVP)
- Reject non-object payloads.
- Coerce numeric fields only when finite.
- Clamp `progress_ratio` to `0..1`.
- Default missing `schema_version` to `1` only for server-internal merge; API input must provide it.
- Ignore unknown fields.

## Example Payload (Narrative)
```json
{
  "schema_version": 1,
  "scenario_type": "narrative",
  "session_id": "lab-abc123",
  "story_id": "rogue-ai-log-ep-0001",
  "reading_time_ms": 183420,
  "progress_ratio": 0.94,
  "scroll_entropy": 1.83,
  "focus_blur_count": 1,
  "input_latency_ms": 2480,
  "quiz_correct": true,
  "quiz_answer_id": 2,
  "consent_mode": "diegetic_opt_in",
  "client_ts": 1760000000000
}
```

## Example Payload (Pressure Simulation)
```json
{
  "schema_version": 1,
  "scenario_type": "pressure_sim",
  "session_id": "lab-def456",
  "event_id": "evt-20260301-final-gate",
  "retry_count": 3,
  "queue_wait_ms": 1420,
  "countdown_to_click_ms": 210,
  "focus_blur_count": 0,
  "input_latency_ms": 210,
  "consent_mode": "diegetic_opt_in",
  "client_ts": 1760000000100
}
```

## Versioning Rule
- Increment `schema_version` only for breaking field meaning/validation changes.
- Additive optional fields can remain within v1.
