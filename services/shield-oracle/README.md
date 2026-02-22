# shield-oracle service (v2)

This folder contains the v2 backend logic for:
- oracle signing and anti-replay checks,
- payload building/serialization (`ShieldPayloadV0`, 141 bytes),
- oracle signature generation,
- anti-replay unique-key checks for `(proof_hash + wallet)`.

Attestation scoring logic lives in:
- `/Users/lenovo/Desktop/HACKTHON PROJECT/services/dignity-scoring`

Current app routes are thin wrappers:
- `/app/api/shield-score/route.ts`
- `/app/api/oracle-pubkey/route.ts`

They call the service handlers in:
- `src/handler.ts`

Security controls:
- rate limiting: `src/rate_limit.ts` (per-IP + per-wallet)
  - production defaults to fail-closed when Redis backend is unavailable
  - configurable via `SHIELD_RATE_LIMIT_REQUIRE_REDIS` (`1` fail-closed, `0` allow memory fallback)
- emergency freeze: `SHIELD_FREEZE=1` on `/api/shield-score`
- static key strict mode: `ORACLE_REQUIRE_STATIC_KEY=1` with `ORACLE_PRIVATE_KEY` or `ORACLE_KEYPAIR_PATH`
  - production defaults to static-key required unless `ORACLE_ALLOW_EPHEMERAL_IN_PRODUCTION=1`
- Reclaim server-side proof verify: `src/reclaim_verify.ts`
  - cryptographic verify via `@reclaimprotocol/js-sdk`
  - owner-wallet binding check
  - context-wallet binding check (default enabled)
  - proof identifier replay blocking
- Replay storage: `src/proof_replay_store.ts`
  - production defaults to fail-closed when Redis backend is unavailable
  - configurable via `RECLAIM_REPLAY_REQUIRE_REDIS` (`1` fail-closed, `0` allow memory fallback)

## Reclaim Hardened Verify Env

- `RECLAIM_ALLOWED_PROVIDERS`  
  Comma-separated provider allowlist. Required in production (fail-closed when empty).
  Example: `RECLAIM_ALLOWED_PROVIDERS=github,twitter`.
- `RECLAIM_REQUIRE_CONTEXT_MATCH`  
  Default `1`. If `1`, `proof.claimData.context` must bind to request wallet.
- `REDIS_URL`  
  Recommended in production for multi-instance replay and rate-limit consistency.
- `RECLAIM_REPLAY_REQUIRE_REDIS`  
  Optional. Default: `1` in production, `0` otherwise.
- `SHIELD_TRUST_PROXY_HEADERS`  
  Default `0`. Set `1` only when the app is behind a trusted reverse proxy/load balancer.
- `SHIELD_RATE_LIMIT_REQUIRE_REDIS`  
  Optional. Default: `1` in production, `0` otherwise.
- `RECLAIM_REPLAY_PREFIX`  
  Default `reclaim:proof-id`.
- `RECLAIM_REPLAY_TTL_SECONDS`  
  Default `300` seconds.
