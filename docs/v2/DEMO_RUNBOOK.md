# UNFORGIVEN v2 — Technical Demo Runbook (Guarded Claim)

One-path runbook for recording the Colosseum technical demo. Main flow: **Guarded Claim** on devnet.

---

## Prerequisites

- Node 18+, yarn
- Solana CLI (for devnet wallet/airdrop if needed)
- `.env.local` from `.env.example` with at least:
  - `NEXT_PUBLIC_PROGRAM_ID` — must match deployed program (see `DEPLOYMENT_STATE.md`)
  - `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`
  - `NEXT_PUBLIC_SOLANA_RPC_URL` — optional; omit to use public devnet RPC
  - Oracle: `ORACLE_KEYPAIR_PATH` or `ORACLE_PRIVATE_KEY` so `/api/shield-score` can sign payloads

**Live on devnet:** Program + `global_config_v2` + `admin_config_v2` must be initialized. If you use a local validator + Next.js only (no devnet), the demo is **local/demo-only**; say so in the video.

---

## Quote mode: live vs fixture (recording stability)

| Mode | Env | Quote source | Use case |
|------|-----|--------------|----------|
| **live** | `NEXT_PUBLIC_DEMO_QUOTE_MODE=live` (default) | `/api/shield-score` (full Oracle: Redis, rate limit, Reclaim) | Full production-like path; may fail if Redis/env missing. |
| **fixture** | `NEXT_PUBLIC_DEMO_QUOTE_MODE=fixture` | `/api/demo/quote-fixture` (Oracle signs only; no Redis, no rate limit) | Recording stability: quote always available as long as Oracle key is set. |

- **Live:** Same as today. Quote comes from the full Shield pipeline. If Redis or rate limit is down, quote can fail (503/429).
- **Fixture:** Quote is built and signed by the **same Oracle key** (ORACLE_KEYPAIR_PATH / ORACLE_PRIVATE_KEY). No Redis, no rate limit. Response has real `payload_hex`, `oracle_signature_hex`, `oracle_pubkey`; chain still verifies Ed25519 and runs `execute_shield` — **on-chain execution is unchanged**. Use fixture when you want to avoid Oracle/Redis/env issues during recording.

**Important:** In both modes the **chain path is identical**: payload → Ed25519 verify → execute_shield → devnet tx → Explorer. Fixture only changes where the signed quote comes from (lightweight endpoint instead of full Shield). The page shows **Quote source: Live oracle** or **Quote source: Pre-signed fixture for demo stability** so the mode is visible. **Fixture mode requires** that the chain’s `admin_config` was initialized with the **same** Oracle key as in your `.env.local` (i.e. you ran `init_admin_v2` with that key); otherwise execute_shield will reject the signature.

---

## Install & Build

```bash
yarn install --frozen-lockfile
yarn run build
```

Optional (recommended before recording): run the CI gate to ensure tests pass:

```bash
yarn run ci:gate
```

---

## Start the app

```bash
yarn run dev
```

App runs at `http://localhost:3000`.

---

## Demo URL and happy path

1. Open **http://localhost:3000/demo/guarded-claim**
2. Connect a Solana wallet (devnet for Explorer proof; or local for fallback).
3. Check **Recording status** at the top: wait until it shows **“Ready to record (devnet)”** or **“Local validator mode (ready)”**. If it shows “Blocked: missing config” or “Quote unavailable”, fix env/chain/Redis per runbook before recording.
4. **Quote status** must be “Quote ready”; **Protocol** “Ready for execution”; **Environment** devnet or local validator.
5. Click **Claim**.
6. Approve the transaction in the wallet.
7. **Recording status** becomes “Success — see transaction below”; page shows **Transaction signature** and **View on Solana Explorer →** (devnet) or “Local validator run” (when `NEXT_PUBLIC_DEMO_EXPLORER_LINK=0`).

**Fresh clone:** No `anchor build` required for the frontend; IDL is in `app/idl`. Run `yarn install --frozen-lockfile`, `yarn run build`, `yarn run dev`.

---

## Proving real devnet interaction

- After a successful claim, click **View on Solana Explorer →**.
- Confirm the tx and program logs on Solana Explorer (cluster = devnet).
- Optionally open `docs/v2/DEPLOYMENT_STATE.md` and show Program ID / init tx signatures to align with the explorer.

---

## If something breaks

- **Quote failed / 503 / 429:** Page shows “Oracle / quote failed: …” and “Quote unavailable”. Set `ORACLE_KEYPAIR_PATH` or `ORACLE_PRIVATE_KEY` in `.env.local`. If 503 is “Rate limit backend unavailable”, Redis may be required (or set `SHIELD_RATE_LIMIT_REQUIRE_REDIS=0` for demo only). Same app serves `/api/shield-score`; no separate Shield process.
- **Admin or global config missing:** Chain not initialized. On devnet run `npm run init:admin:v2:devnet` (with Oracle config) after deploy; see `scripts/init_admin_v2.js` and `DEPLOYMENT_STATE.md`.
- **Transaction fails on chain:** Check RPC, balance, and that Program ID in `.env.local` matches the deployed program.

---

## Fallback (no devnet)

If devnet is down or you cannot init:

- Run a **local validator** and deploy + init locally (`scripts/up_v2.sh`), then point `.env.local` to `http://127.0.0.1:8899` and `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` (or leave cluster as devnet and use local RPC for testing). State clearly in the video: “This run is against a local validator” so judges know it’s not live devnet.

---

## Final recording checklist (before you hit record)

| Step | Action |
|------|--------|
| **Services** | Only `yarn run dev` (Next.js). Oracle runs inside the app via `/api/shield-score`; no separate Shield process. For devnet you need RPC reachable (public or your own). |
| **Env** | `.env.local`: `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, and `ORACLE_KEYPAIR_PATH` or `ORACLE_PRIVATE_KEY`. For **fixture mode** (no Redis): `NEXT_PUBLIC_DEMO_QUOTE_MODE=fixture`. For Explorer: `NEXT_PUBLIC_DEMO_EXPLORER_LINK=1` (or omit). For local validator: `NEXT_PUBLIC_DEMO_EXPLORER_LINK=0`. |
| **First click** | Open `http://localhost:3000/demo/guarded-claim` → click **Connect** (wallet) → wait for Recording status “Ready to record” and Quote source (live or fixture); then click **Claim**. |
| **Quote fails** | **Live:** Check Oracle env and Redis (or set `SHIELD_RATE_LIMIT_REQUIRE_REDIS=0`). **Fixture:** Only Oracle env is required; no Redis. Page shows “Oracle / quote failed” and runbook hint. |
| **Devnet down / RPC slow** | Use local validator: `scripts/up_v2.sh`, point RPC to `http://127.0.0.1:8899`, set `NEXT_PUBLIC_DEMO_EXPLORER_LINK=0`. Page will show “Local validator run” after tx; say in the video that it’s local, same flow on devnet. |

---

## Troubleshooting: Access violation (D 确认)

当 Execute claim 报错 **"Access violation in stack frame 5 at address 0x200005b90 of size 8"** 时，按下面顺序确认：

### 1. 确认链上跑的是新程序

- 已用 **authority 钱包** 重新部署：  
  `SKIP_INIT_ADMIN=1 KEYPAIR_PATH=/path/to/authority-keypair.json bash scripts/deploy_v2_devnet.sh`
- 部署成功后，再在前端点一次 Execute claim；若仍报错，继续下面步骤。

### 2. 用日志判断崩溃发生在哪

程序里在 `execute_shield` 开头加了 `msg!("ExecuteShield:start")`。点 Execute claim 后看 **simulation 或 tx 的 Logs**：

- **看不到 "ExecuteShield:start"** → 崩溃发生在 **进入 handler 之前**（Anchor 反序列化指令/校验 accounts 时）。常见原因：instruction data 不是 213 字节（8+141+64），或 payload/signature 长度不对。
- **能看到 "ExecuteShield:start"** → 崩溃发生在 **handler 内部**（我们自己的逻辑或 CPI）。需要再在 handler 里分段加 log 缩小范围。

### 3. 前端已做的防护

- `buildExecuteInstructionData` 会校验 **payload 141 字节、signature 64 字节**，不对会直接抛错，不会发 213 字节以外的 data。
- `useShieldFlow` 在执行前校验 `payloadBytes.length === 141` 且 `oracleSignatureBytes.length === 64`；若 quote 返回的 hex 长度不对，会提示 "Quote payload/signature length mismatch"。

若你看到的是 "Access violation" 而不是 "payload/signature length mismatch"，说明前端拿到的 payload/signature 长度是对的；此时重点看 **2**：是否出现 "ExecuteShield:start" 以区分是 Anchor 层还是 handler 内。

### 4. 若仍怀疑 accounts / PDA 不一致

- 对比 **Rust** `ExecuteShield` accounts 顺序与 **TS** `buildExecuteInstructions` 的 `keys` 顺序（见 runbook 或代码内注释）。
- 确认 PDA seeds 一致：Rust 用 `seed_payload.user_pubkey / zk_proof_hash / nonce.to_le_bytes()`，TS 用 `payloadBytes.slice(1,33) / (61,93) / (133,141)`，且 payload 布局与链上 141 字节布局一致（Oracle 的 `serializeShieldPayloadV0` 与程序一致）。

---

## One-line checklist

Install → build → dev → open `/demo/guarded-claim` → connect wallet → wait for quote → Claim → show signature + Explorer (or local run).
