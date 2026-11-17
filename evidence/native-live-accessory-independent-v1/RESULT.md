# Native live accessory independent review

状态：CPU 候选保留，男性拇指接触缺陷和 runtime adapter 缺口待浏览器验证。

本次只读检查了 `native-live-accessory-fit-v1` 的 source/runtime-candidate、VRM1 readback、手部依赖、嘴部锚点和 presentation 字段，没有重跑 fit、修改 source/runtime、启动 GPU 或复用旧冻结输出。

## 已确认

- `verify-vrm.mjs` 的 normalized finger rotation 回读通过。female 三个变体最大 raw hand local 误差约 `5.25e-8 m`，male 约 `6.45e-8 m`。两者均实际应用了 `rightThumbMetacarpal/Proximal/Distal` 及其余手指 15 个 normalized bones。当前 VRM1 源文件本身已有 canonical thumb semantics，alias 分支没有掩盖缺失骨骼。
- female face 和 waist 与 female-843ac 的手部 POSITION、JOINTS、WEIGHTS、相关手部 influence inverse-bind/rest 矩阵、节点语义和 731 点选择均相同。嘴部记录仍按各自身体 SHA 保存。
- 四个 presentation 文件内部的 target SHA、grip mount、mouth source SHA 和 microphone grille pole 一致。native mouth raw-head anchor 的相邻面法线与 anchor 方向同向，female/male dot 分别约 `0.888/0.932`。这只证明 source 坐标合同，不证明麦克风靠嘴视觉自然。

## 具体风险

男性 grip 的 731 个采样手部点中，合成 13 mm 径向握持圆柱最大穿入 `6.2016 mm`，超过 1 mm 的 13 个点全部属于 Thumb，顶点 ID 为 `4319, 4322, 4348, 4327, 4349, 4324, 4352, 4357, 4344, 4343, 4342, 4361, 4321`。掌心、食指、中指、无名指、小指没有超过 1 mm 的点。该数字是采样圆柱指标，属于男性握持接触缺陷候选，不能等同完整麦克风三角碰撞或视觉失败。需要 root 的正常速度近景浏览器复核，当前审查不调参、不改标签。

`male-grip.json` 当前记录 SciPy `ftol` 终止、278 次 evaluations、loss `544.48`。打包 evidence 的旧限制文字却写成“male optimizer ended at max function evaluations”，两者不一致，后续重打包时应修正文案。

native presentation schema 将 `mount` 和 `mouth` 嵌套保存，缺少现有 [microphone-pose.js](../../prototype/src/microphone-pose.js) / `live-presentation.js` 直接消费的 `capsuleLocal`、`speakingTipOffset`、`carryWristChestOffset` 和 `transitionRate`。因此 candidate 内部坐标是相容的，直接接入旧 runtime 接口仍需要明确 adapter 与浏览器证明。

完整哈希、逐变体 readback、依赖比较、男性顶点定位和字段检查见 [report.json](report.json)。
