UNFORGIVEN v2 × Stratos Vault 联合方案

1. UNFORGIVEN v2 产品介绍

UNFORGIVEN v2 的定位是高并发场景的公平分配执行中间件。  
它主要解决这些高热度流程里的核心问题：

bot / 脚本抢占导致真实用户成功率下降
静态规则容易被绕过（前端判断、简单限流、固定 allowlist）
业务方缺少“既可解释又可执行”的公平控制层

对 Stratos 的直接价值（产品/商业层）

1） 增强 Dock Apps / 场景方案差异化
在“钱包 + 签名 + 多链”之外，补上一层“公平执行能力”
对外可讲：不仅能安全接入，还能做高热度场景的公平分配/准入控制

2）支持高热度场景（claim / subscription / gated access）
这些场景更容易出现滥用与抢占
也是最需要“公平策略 + 执行约束”的地方

3） 降低业务方自行做 anti-bot 的复杂度
不需要每个应用自己重复实现分层、风控、决策、恢复逻辑
以中间件方式接入，更适合平台化能力沉淀

4）形成可复用联合方案
`Stratos Vault = 钱包/账户/签名平台层`
`UNFORGIVEN v2 = 公平分配执行层`
对外更像完整方案，而不是单点功能
这项能力的价值不只是补一个 anti-bot 功能，而是帮助 Stratos 在钱包/平台能力之外形成“高热度场景公平执行”的差异化定位。

2. 技术能力摘要

2.1 技术定位

UNFORGIVEN v2 是一个面向高并发业务流程的 公平分配执行中间件，重点能力包括决策输出、授权载荷、执行约束与监控治理闭环。

2.2 输入 / 输出

这部分可以理解成“接入时大概怎么配合”。

对方在关键流程节点（例如 claim / gated access / subscription）把请求信息发给 UNFORGIVEN，例如：

用户标识（如钱包地址 / 账户标识）

场景类型（claim / gated access / subscription 等）

少量必要的场景上下文

如果有身份/证明信号（例如 Reclaim 证明、业务侧信号），也可以一起传入

UNFORGIVEN 返回给业务流程的内容包括：

决策建议（`allow / step-up / block`）

高层原因码（方便解释和统计）

按场景需要返回时效信息或授权载荷（用于后续执行）


2.3 当前已具备能力

公平决策链路：可运行

授权载荷与签名链路：可运行（Shield payload + signature）

链上可验证执行路径：已在 Solana 主线完成较完整实现

监控/治理闭环：已具备基础能力（Sentinel）

Reclaim 服务端验证路径：已接入，可用于开发态联调

2.4 集成方式

首阶段建议使用以下任一方式接入：

1） Backend API 调用（推荐）
对方业务流程在关键步骤调用 UNFORGIVEN fairness layer
返回决策结果与高层原因码

2） Dock App 场景后端回调/服务调用
适合 Stratos Vault 的应用承载方式
由场景服务在关键操作点调用 fairness 决策

3）混合集成（第二阶段）
先 API 决策，后接入更深的执行约束/授权消费

2.5 本阶段不披露内容

为提高推进效率并保护双方投入，以下内容建议在确认 pilot 场景与 owner 后按需共享：

详细策略阈值 / 评分配方

完整字段契约与编码细节

内部治理参数与调优逻辑

可直接复刻核心实现的代码级细节

3. 与普通风控API的差异

从产品能力角度，UNFORGIVEN v2 的差异在于：

1）不是只给风险分
输出是可用于业务流程的决策与执行建议（allow / step-up / block）

2）不是只做 UI / API 层规则
目标是把关键公平约束推进到更可验证、更难绕过的路径（当前 Solana 主线已实现较完整闭环）

3）不是只做“拦截”
支持逐步上线方式（例如 shadow → 小流量 step-up → 小流量 enforcement）

4）不是一次性定制脚本
以中间件方式接入，更适合作为平台能力复用

4. 与Stratos Vault 匹配

基于公开文档，我理解 Stratos Vault 的强项在于：

企业钱包基础设施（多链、账户、签名、平台入口）

WebAuthn / MPC 安全模型

白标与多实例部署能力

Dock Apps 应用承载与 SDK 能力

UNFORGIVEN v2 的匹配点：

Stratos Vault 提供：用户入口 + 钱包签名 + 平台承载

UNFORGIVEN 提供：公平分配/准入/执行控制

5. 最适合先验证的场景

建议优先顺序：

1. Gated Access（准入/门禁）
接入成本低，价值表达清晰（公平准入、step-up 机制）

2. Claim（领取/抢领）
anti-bot 价值最直观，容易观察命中分布

3. Subscription / Allocation（申购/配售）
商业价值高，适合 Canton / 合规场景叙事（复杂度更高）


6. 联合 Pilot 建议

6.1 目标

先验证联合方案是否能在目标场景中提供：

有价值的公平决策结果（命中分布合理）
可接受的性能开销（延迟可控）
可复用的接入路径（不是一次性定制）

6.2 Shadow Mode

首阶段推荐真集成 Shadow Mode，原因是：

不直接改动用户结果，风险低
能快速获得真实/准真实数据，便于判断是否值得进入控流阶段
更容易让双方对齐指标与场景价值

Shadow Mode 在这里是 pilot 方法，不是产品价值本身。

7. 联合方案高层架构

1） 用户通过 Stratos Vault 进入目标场景（Dock App / 平台业务流程）
2）业务流程把最小必要上下文发送给 UNFORGIVEN fairness layer
3） UNFORGIVEN 返回决策建议（allow / step-up / block）与原因码（高层）
4） 首阶段记录联合决策结果与指标（Shadow Mode）
5） 根据数据决定是否进入小流量 enforcement


8. 联合 pilot 验收标准

这部分用于双方判断这次 pilot 是否值得进入下一阶段，不是单方内部评估。
建议先按这 4 类结果对齐：

A. 业务价值信号

高风险/可疑请求比例（按场景）
决策分布（allow / step-up / block）
在目标场景中的策略命中率

B. 对 Stratos 场景的潜在收益（Shadow 预测）

若启用策略，预计拦截/升级的请求规模
是否能把“高热度问题”转化为可控分层处理

C. 接入与运行成本

响应延迟（p50 / p95）
接入额外开销（工程复杂度、需要的字段数量）

D. 业务风险可接受性（误判）

抽样复核 `step-up / block` 判定
评估误判风险是否在可接受范围

9. 角色分工（建议）

Stratos Vault

选择首个 pilot 场景

提供最小接入路径（API / Dock App / callback）

提供测试环境、样本流量或日志接入方式（至少一种）

UNFORGIVEN v2

提供公平决策链路与高层决策输出

提供指标模板与试点评估方法

基于 pilot 数据给出第二阶段（小流量 enforcement）建议

10. 下一步

如有合作意向，可进一步讨论：

首个 pilot 场景（Gated Access / Claim / Subscription）

两周 pilot 的范围与成功指标

建议先定一个场景，不并行多个场景
