# 原生男性发色+眉色一次样件

固定男性 `c936b` 源仅执行一次协调方案。发材质 `Color`、`ShadeColor`、`OutlineColor` 设为深棕及深色描边，眉组 `Level1Eyebrow_OverlayColor` 同设深棕。Bridge 保存、冷开读值和原生 VRM1 导出均成功，进入时文件已恢复 `ready=true, dirty=false`。完整请求在 `records/`，导出无警告。

CPU 读回结论必须分开。眉色实际烘入 `FaceBrow` image 8，源PNG和候选PNG分别提取为 `cpu-readback/source-brow.png` 与 `changed-brow.png`。候选image8改变，几何、骨架、IBM、UV、表情和非缩略图结构保持不变。眼白、眼高光、虹膜和皮肤图像没有改变。

发色的原生颜色值在 `.vroid` 冷开后确实变为目标值，但导出的VRM没有任何HAIR材质或HAIR图像变化。Bridge的 `base:<colorId>` getter仍返回 `null`，Main/Highlight layer 查询保留 `texture is not editable yet`。本样件因此标记为 `failed-hair-export-not-represented-brow-exported`，不把整套协调方案称为成功，也不重试同一机制。HairSet001不能未经独立导出读回直接复用这条发色规则。

关键身份如下。源编辑文件仍是 `c936b241…e0e6a`，进入文件仍是固定 `2b01fec…2493ed`。候选 `.vroid` 与 VRM、读回报告和提取PNG均在 `generated/` 与 `cpu-readback/`。`result.json` 记录 139 个 accessor 完全一致、91节点/79骨、表达和授权字段保持。导出image8是眉色变化，image18是缩略图变化。原发图像没有被改写。

本次只验证原生 producer 与导出身份。没有运行时准入、游戏近景、普通电脑性能或独立发型材质验证。原生 meta 没有改动，仍为 `onlyAuthor/personalNonProfit/allowRedistribution=false/modification=prohibited`。本包没有runtime、public、catalog或Git变更。由于发色导出落空，下一步应先核原生发型/材质的实际可导出路径，不能仅依赖冷开颜色字段。

重建入口为 `python -B assets-source/native-vroid-hair-color-study-v1/native_cycle.py`，随后 `python -B .../readback.py`。目录已有记录时不要覆盖，应在新隔离目录复演。脚本会核固定源SHA和干净进入状态，任何未知dirty状态停止并保留现场。
