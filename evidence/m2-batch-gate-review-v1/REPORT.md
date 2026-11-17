# M2 批产闸门运行时接缝审查

审查日期为 2026-11-17。范围包括 `docs/PRODUCTION-PARAMETER-CONTRACT.md`、`scripts/production/native_batch_gate.py`、`evidence/m2-native-production-gate-v3/report.json`、`prototype/src/native-production-catalog.js` 及其进入 `FOUNDATION_PROFILES`、加载器和生产查询的运行时注册点。

## 结论

两份 FaceContour 参数生产已经完成原生制作、冷开回读、导出、差分、身体包、catalog 登记、记录与关闭恢复的相应证据，但这只表示生产链产出了可核对候选。`acceptedForRuntime` 表示更窄的准入结果，当前为空有两个独立原因。

1. v3 两条记录各自仍有四项适配任务。它们是 `dynamicMotion`、`headAttachments`、`runtimeRecordAndBudget` 和 `surfaceAndTexture`。表情任务由精确 body SHA 的 adapter 回归消除，握麦任务由精确身体登记消除。剩余任务仍来自真实差分，不能按同模板或新 SHA 继承旧 fit。
2. 闸门实现把 `bodyPackage` 和 `coverage` 车道固定写成 `prepared`。`acceptedForRuntime` 要求九条车道全部是 `verified`，当前代码没有任何输入可以把这两条车道升级为 `verified`。因此即使四项适配全部完成，按现有实现结果仍会为空。这是代码接缝缺口，不能用重新导出或改标签解决。

## 直接证据

### 准入谓词

`native_batch_gate.py` 的 `package_item` 在第 120 至 126 行初始化九条车道，并在第 122 至 123 行固定写入

```text
authoring=coldReadback=export=dependencyDelta=verified
bodyPackage=prepared
coverage=prepared
```

有运行时报告时，`runtimeCatalog`、`record`、`restore` 才会被写成 `verified`。第 232 至 234 行的准入列表同时要求 `adapterTasks` 为空，并要求 `REQUIRED_LANES` 的每一项等于 `verified`。所以 `prepared` 本身足以使准入谓词为假。

### v3 实际批次

`evidence/m2-native-production-gate-v3/report.json` 的两项均显示

| 项目 | 两项共同状态 |
| --- | --- |
| 可复用检查 | `feetAndFloor`、`garmentsAndCoverage`、`seatContact` |
| 剩余适配 | `dynamicMotion`、`headAttachments`、`runtimeRecordAndBudget`、`surfaceAndTexture` |
| 运行时记录 | `runtimeCatalog`、`record`、`restore` 均为 `verified` |
| 未达准入的车道 | `bodyPackage=prepared`、`coverage=prepared` |
| 结果 | `acceptedForRuntime=[]` |

两条 provenance 仍保留 `runtimeAccepted=false` 与 `visualAccepted=false`。这与契约中“离线包不自动授予动作、表情或附件 fit”和“运行时及视觉检查后才可标记可用”一致。

两份 provenance 的 `followUp` 仍把表情和握麦写成 `needs-recheck`。v3 输出通过外部的精确 body adapter 报告与握麦登记报告在内存索引中移除了这两类任务，但没有回写 provenance。这个差异不改变 v3 当前四项剩余任务，也意味着后续固定交付时应同时核对 provenance 与外部证据的版本关系。

### 运行时注册与准入是两条链

`prototype/src/native-production-catalog.js` 的编译器只检查 schema、body type、资源路径、SHA、地面值、覆盖 manifest、三件装备和初始 outfit。它没有读取 `acceptedForRuntime` 或 provenance 的 `runtimeAccepted`。

`prototype/src/foundation-profiles.js` 第 261 至 262 行把 catalog profile 合并进 `FOUNDATION_PROFILES`。`foundationProfile` 返回该注册项的副本，`foundation-avatar.js` 的加载器再按 URL 读取 VRM、计算 SHA 并执行完整身体与装备初始化。`character-production-query.js` 第 90 至 112 行会把已注册 profile 报告为 `status=registered`。

因此候选可以被运行时识别、查询和在开发构建中准备加载，同时仍未通过批产闸门的 `acceptedForRuntime`。这两个状态没有在现有 catalog 接缝中混为一谈。

## 自动化边界

### 通用契约或脚本可以自动化的部分

- recipe 身份、参数 SHA、source export SHA、body SHA、版本与恢复快照的核对。
- 原生制作、冷开回读和 `native_dependency_delta.py` 的真实差分分类。差分结果可以把未变化检查标成可复用，把变化检查生成有原因的 adapter 任务。
- `native_body_package.py` 的身体、三件同源装备和 coverage 产物生成，以及路径、字节数和 SHA 的确定性校验。
- `native-production-catalog.js` 的结构校验、重复 body 或 profile ID 拒绝、资源 pin 校验和 catalog 的原子数据编译。该编译只负责登记身份，不能代表准入。
- 以 body SHA 为键的 adapter 报告索引和批处理编排。共享 adapter 可以按精确 profile 处理旧结构与新结构，但每个输入仍需留下自己的证据。
- `native_record_batch.py` 的稳定记录请求生成、逐项失败和重试编排。关闭恢复与双实例测试可以批量执行，结果仍需绑定具体 body、record 和 build 身份。
- 对 `inputs-unchanged` 的检查复用。当前批次的服装覆盖、脚底地面和座椅接触属于这一类，复用条件来自差分，而不是人物名称。

### 必须逐身体适配或逐身体留证的部分

- `headAttachments`。面部和头发 mesh 已变化，头部附件挂点与间隙必须按目标 body 的 geometry 和 SHA 重算。
- `dynamicMotion`。发丝动态输入已变化，必须按目标 body 的 hair、动态配置和真实动作回归。
- `surfaceAndTexture`。面部、身体和头发表面输入已变化，必须按目标 body 的材质、图片和覆盖 manifest 重新准入。
- `runtimeRecordAndBudget`。身体和导出字节身份已变化，记录回读、动作与表情控制、实例隔离、关闭恢复和目标设备预算必须针对该 body 复核。开发机平均帧率不能替代普通电脑测量。
- `handAndMicrophone` 与 `facialExpressions`。当前两项已有按精确 body 的共享 adapter 和握麦登记证据，因此从 v3 任务列表移除。新身体、新附件或 morph 结构变化仍需重新产生对应证据，不能由这两项外推。
- 人工视觉和正常速度检查。脚本、源工具截图、CPU 绑定检查或平均 FPS 都不能单独授予契约中的可用状态。

## 最小下一步

1. **先修闸门状态接缝。** 为每个 body SHA 接入身体包和 coverage 的精确报告索引，报告至少包含产物路径、body SHA、装备 manifest SHA、coverage manifest SHA、版本与失败状态。只有报告状态为通过且 pin 与 package/spec/provenance 一致时，才把 `bodyPackage`、`coverage` 置为 `verified`。继续保留缺失或冲突时的 `prepared`，不要把文件存在当成通过。
2. **对两条记录分别完成四项剩余适配。** 每项输出以 body SHA 为键的输入、输出、版本和恢复证据。适配器实现可以共享，证据不能共享替代。
3. **用同一批次重跑 gate。** 复核 `adapterTaskCount=0`、两项的九条车道均为 `verified`、body/coverage report pin 与 package SHA 一致，并预期 `acceptedForRuntime` 出现两个稳定 item ID。随后再补人工视觉、正常速度和目标设备性能证据，才可把候选提升为可用资源。

## 可验证证据清单

- 当前基线可由 `evidence/m2-native-production-gate-v3/report.json` 重现，批次两项的 body SHA 分别为 `825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547` 与 `9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb`。
- 运行时消费证据为 `evidence/m2-native-record-plan-v4/runtime/dual-restore/report.json`，它证明技术记录、表情/讲话控制、双实例和关闭重开恢复，范围不覆盖剩余四类适配或视觉验收。
- 表情 adapter 证据为 `evidence/m2-native-eye-admission-v9/adapter-regression.json`，握麦登记证据为 `evidence/m2-native-batch-runtime-v1/microphone-registration.json`。两者均按具体 body 身份索引。
- 运行时注册可由 `prototype/src/native-production-catalog.json`、`prototype/src/foundation-profiles.js` 和 `prototype/src/character-production-query.js` 的路径复核。catalog 中的 `fitStatus` 仍明确写有 gameplay fit、contact 或视觉待定，不应解释为准入。

## 审查配置

本子任务按父任务派工记录使用 `difficulty=complex`，选择高能力模型与高思考深度。当前运行时没有向子代理暴露可核对的具体模型名或数值 reasoning 参数，因此本报告只记录已验证的派工配置，不冒认未暴露的模型标识。

本次只读审查未修改脚本、catalog、资源或运行时代码，仅新增本报告。
