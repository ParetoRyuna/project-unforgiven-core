# Universal Shield SDK (Scaffold)

## Two-line integration target

```ts
import { activateUniversalShield } from "@unforgiven/universal-shield-sdk";
const quote = activateUniversalShield({
  userPubkey,
  initialPrice,
  salesVelocityBps,
  timeElapsed,
  mode: "verified",
  attestations,
});
```

## Notes
- Returns price quote + `proof_placeholder` + serialized payload bytes for on-chain verification.
- `buildExecuteShieldRequest(...)` returns `payload + oracleSignature` for `execute_shield` (non-preview path).
- Uses dignity-weighted VRGDA and infinity-block semantics for bot bursts.
- Includes built-in anti-resale policy defaults: `maxTicketsPerWallet=1`, `cooldownSeconds=86400`.
