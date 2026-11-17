# 头部附着件后验入口

当前状态为准备完成。原源、55帧 strict baseline、498条源端点记录和原函数身份已核对。8项合成坐标和接口检查通过。未读取任何已求解候选数组，未对源或候选执行55帧求交，未生成VRM。新 attachment lean/round 未通过正式截面门，本入口保持未对它们执行后验。

```powershell
python -B scripts/m2-head-attachment-readback-v1/readback.py
python -B scripts/m2-head-attachment-readback-v1/qa.py
```

首次输出为 prepared.json 和 qa.json。入口拒绝覆盖已有记录。源数据或方法版本变化须显式更新本包pin并重新审查，现有准备记录保留。

## 后续实际调用

root确认存在通过数值初门的新候选并授权执行后，填写 candidate-input-template.json 的确切路径和SHA，再执行以下入口。模板中的null和占位值会被拒绝。

```powershell
python -B scripts/m2-head-attachment-readback-v1/readback.py --execute-candidate assets-source/m2-head-attachment-readback-v1/requests/actual-candidate.json --out assets-source/m2-head-attachment-readback-v1/results/actual-candidate.json
```

候选报告须来自本包精确pin的 semantic-head-attachment-slim-source-v1。成功schema为 semantic-head-attachment-slim-result-v1，status为 numerical-head-candidate-only。报告记录id、原sourceRequestId、methodSpecSha256和sourceEndpointRecords。原数值字段须完整且通过有限性、det>.12、固定eye/neck/frame≤2µm、Float32烘焙≤2µm和101截面≤2mm。失败、旧方法或缺字段均先拒绝。

入口由原 common.float32_readback 重新计算拟烘焙值，并与保存的 float32BakeRoundTripM 精确比较。按原 sourceIndices/offset 还原全部Face/Mouth三角所需顶点，缺失点或冲突的重复源索引直接失败。原 contacts/segment_hits 直接作AST复用，保持两个primitive内的原三角编号。逐原base及54个单表达端点与 source-male.json 引用的既有 strict baseline 比较。新增strict对一律失败，原已有对单独记录，旧浮点边界失败没有豁免。

候选可另提供 candidateVrm 的确切资源引用。入口回读原nodes/skins/materials/textures/images/VRM扩展、原二进制前缀、索引顺序、UV/JOINTS/WEIGHTS、表达数及已保存端点。未提供实际VRM时，该项保持pending。法线方向质量、动作及视觉仍另验。

## 可复用检查和待验证语义

| 项目 | 可复用或已准备的检查 | 尚待实际验证 |
| --- | --- | --- |
| 固定眼组件 | 新合同仅固定EyeIris、EyeHighlight、EyeWhite。所有原base/单表达端点按源索引量测实际Float32位移≤2µm，实际VRM另核眼骨/权重/IBM身份 | 保持位置不证明眼白覆盖、视线或眼部外观正确 |
| 眼线/睫毛/EyeExtra | 作为共同映射附着件保存全部原索引和表达绑定，完整Face/Mouth严格求交保持原基线 | 当前没有已核的完整眼白覆盖判据。实际Blink、Blink_L、Blink_R、Joy须0→1→0播放和采样，并看眼白/眼线/睫毛的遮盖关系 |
| HairBack | 原hair fit可复用源SHA、材质、raw-head-bind-local挂点及拓扑身份检查。原build-report保留全部250个引用顶点及源位置 | 现有资源没有完整发根标签或头皮对应表。旧lowerPreservedY和最近点子集不能代表全部发根。源/新距离、间隙、穿入和连接连续性须先有完整对应，再结合正侧近景及动作检查 |
| 替换短发fit | 原male-sidepart-v1 fit只适配原62b源SHA | 新源即使骨架相同也不自动兼容旧fit。需新源精确fit和头皮/耳/脸检查 |
| 表达 | 原绑定Neutral为mesh1 target0，Blink为11，Blink_L为13，Blink_R为12，Joy为4。prepared.json保完整原绑定 | 55个单端点不覆盖表达混合或连续播放，不代表闭眼、笑脸、嘴型和内外唇关系已通过 |

strict对计数、固定点位移和拟Float32端点回读都保留各自范围。源/候选、实际导出、游戏表现及用户视觉验收分别记录。
