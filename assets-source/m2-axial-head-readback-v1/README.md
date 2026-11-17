# 连续轴向G的完整原源后验

本包有独立的新方法合同。root已授权并完成lean、round各唯一一次55帧strict，原准备/QA阶段记录均保留。lean新增对0，通过本包接触及固定点读回。round有6个新增state-pair发生项，保留failed-not-admissible且不重跑。本包没有调用新G或导出VRM。

```powershell
python -B scripts/m2-axial-head-readback-v1/readback.py
python -B scripts/m2-axial-head-readback-v1/qa.py
```

入口拒绝覆盖已有结果。prepared.json记录完整原源清单、预期记录和固定源mask。真实源包含2个POSITION accessor，共9911个引用ID。Body/Hair accessor7有7855点、没有morph。Face accessor21有2056点、54个morph。共有56条完整记录、120935个端点发生项。Body在表达状态中复用base，入口会拒绝虚构Body morph。

每条新记录明确positionAccessor、endpoint、targetPositionAccessor、全部mesh/primitive/material/indexAccessor引用、sourceIndices、offset/count。消费时按这些源索引恢复，不沿用旧113713点映射分区，也不按材质遗漏原衣服、鞋或隐藏部件。原共享targets不一致时拒绝合并。当前原源无未引用POSITION缓冲项，清单仍保留该字段和处理职责。

## 后续候选执行

`spec.json`已pin新evaluationSpec `93c8802e359a3655a81a3308f0f42f2eb05486d5809a0f332dc089851a0fa5d8`、实际producer记录和mask，以及独立完整数值audit `58321fc546b32fa56868ce9ab531e38465c7d343151e8c2e671c3e3517f1659b`。functionSpec、每项coefficients、原sourceContract和完整inventory分别保留身份。早期null-pin准备和旧QA没有覆盖，最新准备为prepared-v3.json，最新14项QA为qa-v3.json。旧SLIM schema、status、method SHA或tet指标不授予此入口通过。

producer数值初门通过且root选择候选后，填写candidate-input-template.json中的实际资源和SHA，再执行以下命令。当前占位值不能使用。

```powershell
python -B scripts/m2-axial-head-readback-v1/readback.py --execute-candidate assets-source/m2-axial-head-readback-v1/requests/actual.json --out assets-source/m2-axial-head-readback-v1/results/actual.json
```

结果schema为axial-head-evaluation-result-v1，成功status为axial-head-numerical-candidate-only，methodId为m2-axial-head-evaluation-v1。必须精确匹配sourceSpec/functionSpec/coefficients/coefficientAudit/inventory/new records/new fixed masks，全部失败字段为空，并通过实际G.J、固定eye/neck/frame、Float32和101截面门。实际sourceJacobians按120935点重算行列式，保持>.12。这里记录实际源/表达点上的G.J，未借用tet字段或外推浮点连续域证明。

源端点NPZ需有sourceEndpointsM、mappedEndpointsM、float32BakeRoundTripM及sourceJacobians。入口核所有原源坐标、完整记录引用和原54个target accessor，再用冻结Float32核心重新计算拟bake端点并精确匹配保存值。随后才对原base加54个单表达端点求FaceMouth/Face_SKIN strict，保原三角编号并与原source-male基线比较。新增交对一律失败，旧数值边界失败没有豁免。

EyeIris/Highlight/White的完整原引用集覆盖全部55状态。Neck只复用原源标签里的68个明确source ID，8个frame源点仅作原边界守卫数据。旧映射数组没有参与该mask构造。实际producer mask须精确匹配这些源集合。

可选candidateVrm只有root明确指定新资产时才提供。所有数值/方法门通过后才会读它。既有源属性/表达/端点回读函数保留，并额外检查每个共享primitive消费的实际端点。这里没有VRM导出器。

几何三角法线用于退化/朝向诊断，原作者着色N传递和morph NORMAL差值另验。实际G.J可供后续源着色N逆转置传递，但本包没有生成或验收着色N。shader归一化不替代这项工作。发根完整标注、眼白遮盖、Blink/Joy连续播放、混合表达、动作和游戏验收仍pending。

## 已完成的唯一实际运行

| 原请求 | 实际覆盖 | 新增strict发生项 | 用时 | 结果 |
| --- | --- | ---: | ---: | --- |
| male-long-lean-v2 | base及54原单表达，55/55 | 0 | 12.580s | 接触及固定点通过，语义/游戏pending |
| male-round-stocky-v2 | base及54原单表达，55/55 | 6 | 12.634s | failed-not-admissible |

两例均精确绑定通过数值门的report/raw/coeff/audit/新records。预算每例600秒、3GiB，于每帧前检查，实际观测RSS约97MB。原baseline共有322个state-pair发生项，各例分别列出原已有、候选和新增对。round新增项位于target1和34的[223,976]、[280,1032]，及target25的[255,1053]、[255,1056]。target1绑定原Fun，target25/34保原目标名并无直接VRM组绑定。没有新增对豁免。

真实结果在results/，各例记录执行次数1。该目录结果保持原字节，进一步诊断另立证据目录，不覆盖或重标此失败。
