# UNFORGIVEN v2 评委问答（CN）

目标：中文答辩时保持主线一致，不把项目讲散。

## 1) 你这个到底是票务项目，还是基础设施？

答：
UNFORGIVEN v2 的主产品定位是 **基础设施 / 中间件（fairness middleware）**。票务、Fan Pass、Hide & Sis 这些都是示例场景，用来证明同一套 Shield-first 机制可以插在不同业务流程前面，不是三个并列产品线。

## 2) 你们为什么不是普通的风控 API？

答：
区别在于我们不是只在服务端做判断，而是把关键约束做成 **链上可验证路径**。客户端交易里会先跑 `Ed25519Program` 验签，再调用程序指令；程序通过 `sysvar::instructions` 校验上一个指令是否真的验证了指定消息和签名。这让前端或中间层更难绕过。

## 3) zkTLS 在这里起什么作用？

答：
zkTLS（通过 Reclaim proof）提供用户侧信号，用于生成 dignity score / adapter mask。这个分数不会直接暴露原始隐私内容，而是用于影响定价压力或访问策略。重点是：我们把“身份信号”接入了链上可执行的公平性路径，而不是只做前端 badge。

## 4) 你们怎么防止 proof 被重复使用？

答：
有两层：
1. 服务端 proof identifier replay protection（生产环境默认 Redis fail-closed）
2. 链上执行路径 `execute_shield` 通过 `ProofUse` PDA 做一次性消费（proof tuple + user + nonce）

这意味着 preview 可以反复报价，但 execute 不能无限重放。

## 5) 你们怎么证明系统不是“演示一下 UI”？

答：
我们有一个严格验收命令 `npm run gate:all`。它会跑代码检查、测试和完整 ops smoke：拉起链/API/sentinel，执行 burst，触发 governance，执行 reset，再做 post-reset preview。最终输出结构化报告 `/tmp/wanwan-ops-smoke-report.json`，里面有治理交易签名、reset 签名和 hash 变化验证字段。

## 6) 你们的创新点到底是什么？单个点看起来都不是第一次出现

答：
对，我们的创新重点是 **组合创新 + 可验证闭环**，不是单点发明：
- zkTLS 身份信号
- deterministic payload（141-byte handshake）
- on-chain Ed25519 instruction introspection
- preview / execute split 防重放
- sentinel 检测 + governance + reset 恢复链路

评委应该把它看成一套可落地的公平发布中间件，而不是单个算法 demo。

## 7) 为什么选 Solana？

答：
因为高并发、低延迟场景下，公平性问题最明显，也最需要可组合的链上约束。Solana 的交易组合模型和性能非常适合我们这种 `Ed25519 verify + program instruction` 的执行路径，以及实时日志驱动的监控/治理。

## 8) 你们目前最大的短板是什么？

答：
主要不是协议路径，而是商业化验证：需要更多真实集成或试点流量证明市场需求。工程和可靠性已经有比较完整的本地验证闭环，下一步重点是 pilot integration。

## 9) 如果评委质疑“这还是太复杂，团队不会接”怎么回答？

答：
回答重点是“对接面很小”。集成方只需要接 Shield API / SDK，拿到固定字段（`payload_hex`、`oracle_signature_hex`、`oracle_pubkey`），然后按两指令交易模型提交。复杂度主要封装在中间件内部，不要求业务方重写核心业务逻辑。

## 10) 你们下一步最关键里程碑是什么？

答：
1. 一个真实 pilot 集成（launchpad / claim / gating 场景）
2. 生产部署硬化（共享 Redis、KMS/HSM、监控告警）
3. 真实流量下的策略参数验证

这三项完成后，项目会从“强技术原型”进入“可部署基础设施”阶段。
