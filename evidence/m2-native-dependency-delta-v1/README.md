# 原生 VRM 导出依赖差分

使用生产回读归档中的同模板 VRoid Studio 2.16.0 女性基线、脸部候选和腰部候选，按各自 SHA-256 运行离线比较。每组覆盖 14 个 primitive、160 个节点、3 套 skin、24 张嵌入图及 146 个实际被引用的 accessor。

| 实跑输入 | 观察到的变化 | 需复验 |
| --- | --- | --- |
| [基线与自身](female-self.json) | 各项被比较依赖一致 | 各检查所观察的输入一致 |
| [脸部候选](female-face.json) | FaceMouth 与 Face_SKIN 的引用位置、法线及 38、39 个 morph 分别变化。HairBack 位置和法线变化，Body_SKIN 有 31 个引用法线变化。缩略图字节变化。 | 表情及口型、眼镜等头部挂点、麦克风口端、发丝动态、表面渲染和新资源的运行记录 |
| [腰部候选](female-waist.json) | Body_SKIN、Bottoms、Tops 的引用位置和法线变化，18 个辅助节点、每套 skin 的 12 个逆绑定矩阵、6 条 TopsUpperLeg SpringBone 链的关节 `hitRadius` 变化。 | 服装绑定与覆盖、坐起接触、动态和表面。骨架或 skin 变化时保守要求复核足底、头手挂点与表情。 |
| [不同模板](different-template.json) | 现有男性 VRM 的 mesh 布局不同 | `unsupported`，退出码 2 |

七项回归通过，覆盖 accessor 重编号后按实际引用比对、primitive 顺序变化、节点数量变化、三角索引变化、sampler 实际值变化、仅 morph 位置变化、错误 SHA 与目标已存在。仅躯干或后发 morph 位置变化的测试使用衍生夹具验证复验标记。用修正后的规则重算上述四份报告的 `requiredChecks`，结果与原记录逐项一致。

调用入口为 `python -B scripts/production/native_dependency_delta.py --baseline PATH --baseline-sha256 SHA --candidate PATH --candidate-sha256 SHA --output NEW.json`。调用方须先核对两个输入来自同一作者模板与导出设置。`compared` 表示比较已完成。`inputs-unchanged` 只描述该项可观察的输入，实际装配、动作接触、游戏适配和观感由各自验收记录确认。
