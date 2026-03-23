# UNFORGIVEN v2 部署状态（Devnet）

本文档记录当前 **Devnet** 上的部署信息，便于团队与脚本对齐。下面的 Program、PDA 与初始化交易已在 **2026-03-23** 通过 `solana` CLI 重新核验。

---

## 网络与程序

| 项 | 值 |
|----|-----|
| **Cluster** | devnet |
| **Program ID** | `5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW` |
| **部署钱包** | `EhTPPwYGDW1KEn1jepHArxGzvVtfo5KBEBfBEFc66gBo` |
| **ProgramData** | `9wcoF6u4veB9qSYhgXLiXoV6ZNxnJXkTc2aQWvR6TYJJ` |
| **链上状态** | `solana program show ... --url devnet` 可查到 `Authority` 与 `Data Length=618824` |

---

## 初始化交易签名

| 步骤 | 交易签名 |
|------|----------|
| **initializeV2** | `5z4B2Zm1LjSiUMwTdvykMegB4sksqZx3fnqSQ6rzKqodAQhKFPLCBBSYET4NNiXPo4zQSBJcp578JakLsiFLgFSV` |
| **initializeAdminConfig** | `4PNaXCeoUg1LZux42dvyKGQBgPnjmfhdhq8geX23iumNtpBPgseuQ1KfnaVjo2xUniwHDFoELRBhEiukrfiTzK2c` |

- `solana confirm -v` 复核结果：
  - `initializeV2`：slot `448653923`，区块时间 `2026-03-15T21:07:32+08:00`，日志包含 `Instruction: InitializeV2`
  - `initializeAdminConfig`：slot `448653928`，区块时间 `2026-03-15T21:07:34+08:00`，日志包含 `Instruction: InitializeAdminConfig`

---

## 核心链上账户（已确认存在于 Devnet）

以下 PDA 由 Program ID 派生，已确认在 devnet 上存在，且 owner 均为 `5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW`：

| 账户 | PDA 种子 | 地址 |
|------|----------|------|
| **global_config_v2** | `["global_v2"]` | `Qfv2aF3NpH3mhJ6x47TxHgtYPo62e3GuEDR8KQbf8fu` |
| **admin_config_v2** | `["admin_config_v2"]` | `BbgU3AzJhDPBbckByFL5JjfPNw391aAYxPDfEBGsRQWo` |

- 派生方式（与 `programs/unforgiven_v2`、`lib/unforgiven-v2-client.ts`、`scripts/init_admin_v2.js` 一致）：
  - `global_config_v2` = `PublicKey.findProgramAddressSync([Buffer.from('global_v2')], programId)[0]`
  - `admin_config_v2` = `PublicKey.findProgramAddressSync([Buffer.from('admin_config_v2')], programId)[0]`

---

## 与仓库配置的对齐情况

- **Anchor.toml**：`[programs.devnet]` 与 `declare_id!` 均为上述 Program ID。
- **.env.example**：`NEXT_PUBLIC_PROGRAM_ID`、`NEXT_PUBLIC_SOLANA_CLUSTER=devnet`、`RPC_URL` 指向 devnet。
- **configs/sentinel_config_v2.devnet.toml**：`program_id`、`admin_config_pubkey` 与上表一致；`rpc_url` / `ws_url` 为 devnet。
- **前端**：`useUnforgivenProgram` 使用 `NEXT_PUBLIC_PROGRAM_ID`（缺省为同一 Program ID）；`InitializeButton`、`lib/unforgiven-v2-client.ts` 均通过 PDA 派生使用上述两账户。

---

## 后续待办（部署未完成部分）

- [ ] 按需继续部署/扩展其他组件（Sentinel、Hub、前端实例等）。
- [ ] 确认 Oracle 与 Shield API 在 devnet 环境下的配置与可用性。
- [ ] 跑通 devnet 上的 smoke（如 `smoke_ticket_v2.js`）与端到端流程。

---

*最后更新：2026-03-23，基于实际 devnet 链上查询结果更新。*
