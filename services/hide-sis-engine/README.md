# hide-sis-engine service

Core state-machine helpers for Hide & Sis v0.1:
- truth gate (`D >= 70 && T >= 1 && F == 0 && C2_N3 passed`),
- ending resolution (`SILK_BURIAL_TRUE`, `BROKEN_OATH`, `FRAMED_AND_JAILED`),
- deterministic event replay.

The canonical numeric codebook is imported from:
- `packages/universal-shield-sdk/src/hide_sis_types.ts`

