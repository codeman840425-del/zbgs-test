# 固定运行时的陌生身体接收边界

构建 `9ce414f65f55`（源码 `cb3aca0d`）没有独立且可追加的受审身体目录。制作侧可以由配方重算候选模型、自动出身体和装备身份、用接收器登记并生成精确款式请求。当前登记落在 `prototype/src/source-outfit-profiles.json` 和 `prototype/public/assets/rule-body-*/`。前者被静态导入，构建摘要包含这份 JSON、两个款式矩阵相关输入以及全部公开资源。运行时的 `--records` 只增加最终记录和记录清单。打包器仍要求身体能在固定源码的目录中查到，资源必须出自固定构建的公开清单或受审编译文件。只把新的 VRM、清单或记录拷进普通游戏目录，固定编译包也无法查到新身体。 [身体目录](../../../prototype/src/foundation-profiles.js) · [构建输入](../../../prototype/scripts/build-id.mjs) · [资源解析](../../../scripts/runtime-package/record-resources.mjs) · [普通游戏合包](../../../scripts/runtime-package/game-record-inventory.mjs)

## 固定包上的实际拒绝

从 `F:/` 启动一次新 Node 进程。探针先按本次已有仓库评审核对 `build-info.json`、普通游戏入口的 JS 和实际共享身体模块。检查确认编译后的 D02 入口调用该模块的 resolver，随后直接调用该 resolver，并独立调用同一固定检出的 D02 `query`。两具已登记身体只读取目录，其摘要均吻合。占位 `rule-body-00000000000000000000` 在两处都返回 `Unknown foundation body type`，资源请求为 0。该占位不含配方、权重或模型。探针从未请求融合方的盲测参数。 [探针和实际结果](../../m2-frozen-rule-game-v1/formal/runtime-probes.json)

```powershell
$repo = 'F:/gamemake'
node "$repo/evidence/m2-frozen-rule-game-v1/formal/frozen-runtime-boundary-probe.mjs" `
  "$repo/experiments/worktrees/rule-male-a-cb3aca0d" `
  "$repo/scripts/runtime-package/game-record-first-rule-reviewed.json" `
  rule-body-00000000000000000000
```

这里的评审文件用于只读比对固定产物的摘要。正常发行仍由 `game-record-cli.mjs` 自动从仓库索引选择评审，`--reviewed` 只能提供字节完全相同的副本。当前固定构建已有这份运行代码和包依赖的评审；正式整套审核索引仍为空。 [评审选择](../../../scripts/runtime-package/game-runtime-review.mjs) · [当前索引](../../../scripts/runtime-package/game-runtime-reviews.json) · [整套索引](../../../scripts/production/outfit_admissions.json)

## 两条受审路径

| 路径 | 最小变更与限制 |
| --- | --- |
| 现行固定检出重建 | 先固定 `rule_body_producer.py`、模板、`receive_rule_body.py`、`received_outfit_request.py` 和选款、D02、合包入口。新模型用数据登记即可，变更只需源身体目录、身体/装备文件及精确款式条目；需要正式选款时沿用固定 `representative-matrix.json` 和精确审核。新数据进入构建摘要，必须从确切提交独立构建并登记新的运行时评审。无需按新 SHA 改控制代码，但每批仍要重编译。 |
| 一次加入独立数据目录后固定运行时 | 若验收要求在引擎和工具冻结后导入陌生参数，需先为受审内容定义版本化清单。制作输出只增加资源与内容身份；固定运行时和固定合包工具共同读取同一份已验证数据。最小引擎落点是 `foundation-profiles.js` 的目录解析与 `record-consumer-demo.js` 的 D02/普通冷开初始化，若扩及工作台再让其进入同一初始化。正常记录入口通过 `character-record-input.js` 校验内容引用。工具侧由 `received_outfit_request.py` 生成内容清单，`game-record-cli.mjs`、`game-record-inventory.mjs`、`record-resources.mjs` 和 `files.mjs` 让同一内容的 SHA/长度参与闭包、验证和复制。正式选款仍走 `variant_batch.py` 和 `outfit_admission.py`，接受经审矩阵摘要并绑定精确内容身份。这是待实现的路径。 |

第二条先固定代码提交、编译包审查、工具提交和清单格式，再选择留给接收方的参数。清单至少应绑定允许的模板与配方摘要、来源、内容包摘要、身体 ID/VRM 摘要、装备槽、适配/覆盖、文件长度及 SHA；单独登记的内容评审应绑定可用运行时身份。重复计算必须得到相同身体和装备身份。内容路径仅限包内批准目录，碰撞、缺项、摘要改变、跨体适配或未知格式应在记录加载前拒绝，旧包继续按原合同冷开。工具可按配方独立重算，普通冷开只消费已审产物。

运行时评审覆盖确切编译包。新内容仍需单独核对来源权利和材料使用范围。新身体及整套精确记录不能继承本轮的适配、动作和接触、拒绝恢复、冷开、四层预算或人眼结论。普通电脑和人工观感在本轮待验。证据绑定新记录、内容和运行时身份，正式审批仍由既有独立入口签发。 [当前逐记录的审核范围](../lane-audit.json) · [正式审核合同](../../../scripts/production/outfit_admission.py)
