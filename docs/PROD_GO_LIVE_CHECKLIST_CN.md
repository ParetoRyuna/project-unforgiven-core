# 生产上线清单（小白版）

适用于当前项目的最小合规上线流程。按顺序执行，不要跳步。

## 1. 代码门禁
- 确认分支：`codex/next16-prod-hardening`
- 本地必须通过：
  - `npm run lint`
  - `npm run build`
  - `npm run ci:gate`
  - `npm audit --omit=dev`
- 目标：`audit` 的 `high/moderate/critical` 都是 `0`。

## 2. 密钥与环境变量
- 使用 `.env.example` 生成生产配置（不要把真实密钥提交到 Git）。
- 生产必须开启：
  - `ORACLE_REQUIRE_STATIC_KEY=1`
- 必须提供其一：
  - `ORACLE_PRIVATE_KEY`（JSON 数组）
  - `ORACLE_KEYPAIR_PATH`（容器内绝对路径）
- 建议开启：
  - `SHIELD_RATE_LIMIT_REQUIRE_REDIS=1`
  - `REDIS_URL=...`
  - `RECLAIM_REQUIRE_CONTEXT_MATCH=1`

## 3. 网络与入口安全
- 仅在可信反向代理后开启：
  - `SHIELD_TRUST_PROXY_HEADERS=1`
- 未在可信代理后：保持 `0`。

## 4. 发布前验收
- 在预发布环境跑一次完整回归：
  - 钱包连接
  - `sign-alpha`
  - `shield-score`
  - 购票主流程
- 观察日志里是否出现异常堆栈或频繁 5xx。

## 5. 发布策略
- 先灰度（小流量）再全量。
- 预留回滚版本（上一个稳定 tag/commit）。
- 监控告警必须有人值守。

## 6. 紧急开关（故障时）
- 立即冻结入口：
  - `SHIELD_FREEZE=1`
- 修复后再恢复：
  - `SHIELD_FREEZE=0`

## 7. 合并要求（团队协作）
- 通过 PR 合并，不要直接推 `main`。
- PR 必须附上：
  - 变更说明
  - 测试结果
  - 回滚方案
