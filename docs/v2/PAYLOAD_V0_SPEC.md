# ShieldPayloadV0 Byte Spec (Frozen)

`ShieldPayloadV0` is the signed message body for UNFORGIVEN v2 policy `v0`.

- Endianness: little-endian (LE)
- Total length: **141 bytes**
- `oracle_signature` (64 bytes) is **not** part of this payload body.

| Offset | Length | Field | Type |
|---|---:|---|---|
| 0 | 1 | `policy_version` | `u8` |
| 1 | 32 | `user_pubkey` | `[u8;32]` |
| 33 | 8 | `initial_price` | `u64` |
| 41 | 8 | `sales_velocity_bps` | `i64` |
| 49 | 8 | `time_elapsed` | `u64` |
| 57 | 1 | `dignity_score` | `u8` |
| 58 | 1 | `adapter_mask` | `u8` |
| 59 | 1 | `user_mode` | `u8` (`0=bot_suspected,1=guest,2=verified`) |
| 60 | 1 | `zk_provider` | `u8` |
| 61 | 32 | `zk_proof_hash` | `[u8;32]` |
| 93 | 32 | `scoring_model_hash` | `[u8;32]` |
| 125 | 8 | `attestation_expiry` | `i64` |
| 133 | 8 | `nonce` | `u64` |

## Signature

- Instruction args:
  - `payload: ShieldPayloadV0`
  - `oracle_signature: [u8;64]`
- Signature verify message: the exact 141-byte payload body above.
