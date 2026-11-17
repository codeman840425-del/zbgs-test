# 单Tops原生卸装：皮肤因果通过，独立衣物重装未通过

2026-11-17。只执行一次女性Tops移除和一次VRM导出，17次逐步MCP调用全部成功，无重试、无额外卸装、无手工绘图、无权重修改。先保存新男性快照，结束已回开该快照，ready=true、dirty=false；独占GPU/Bridge窗口已向root释放。原男女.vroid SHA保持原值。

38组→37组→冷开37组，唯一差异是Tops `0651673b88702f454523c48963fd21a01d976554.transferablegroup`。Bottoms、Shoes、InnerTop、InnerBottom及所有其它组id/type/resource不变。原生导出`meshErasure=false`，减面均0，无warnings；几何/贴图相关export settings与78912原导出全部一致。

| 检查 | 实测 |
|---|---|
| Body实际三角 | 10022/10022精确pos+UV有向三角对应，无丢失/新增/歧义 |
| 裤/鞋实际三角 | 1624/1624、712/712，同样全部对应 |
| 上述实际引用属性 | POSITION、NORMAL、UV、WEIGHTS逐值全等；JOINTS按实际骨名对应，四lane全等（含零权lane）；rest蒙皮误差0mm |
| 共同骨 | 父骨名、世界rest矩阵、共同IBM全部零差；未用共享POSITION中被移除衣物顶点误判Body变化 |
| 原生Body图片 | 同2048²；整张解码RGB逐像素全等，仅608383个alpha texel变化；原578913个alpha0，现全4194304个texel alpha255 |
| Body真实UV采样 | 70154个bilinear样本，原11118个低于.5样本全部恢复，新增/残留低alpha0；原腹髋膝下样本仍0低alpha |
| 裤/鞋材质 | 解析图片SHA/sampler后的完整MToon材质结构相等 |
| 衣物骨依赖 | skin joints130→110，确实去掉20个Tops joint；原Tops739引用点中250点依赖其中10个有非零权重的骨，最大合计缺失权重0.9000000358 |

更完整场景节点检查见`auxiliary-spring-readback-v2.json`：原160节点→130节点，除20个skin joint另有10个非skin终端节点被移除。它们构成10条原生spring链，分别挂原左右上臂/大腿，整条链均从新源消失。早期v1只用skin-joint集合，链尾“outside set”不能解释为仍在场景；v2显式纠正并保留v1。

因此，本次原生制作确证了**Tops自身SkinMask导致旧Body透明，卸装原生导出保留真实RGB并恢复alpha**。这里没有生成肤色、修改PNG或换灰材质。全图片alpha与真实UV读回提供可见性依据；尚未看该新候选裸体视图、未验证动作/换装视觉，仍不能称完整factory或八体完成。旧上衣原绑定引用已不存在的辅助骨，不能只改compatibleAvatarSha256；“皮肤恢复成功”与“衣物可重装”须分开。

输出精确路径/SHA、调用回包、源不变和恢复状态见`closure.json`；全量实际数组见`actual-readback/arrays.npz`。`source-self-readback`只作原源自比较。CPU封包脚本初遇历史回包没有顶层ok字段，修为核实际result.isError及内层ok后完成；没有因此重调任何native操作。

当前主Bridge打开的是 `assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/male-before-skin-study.vroid`，不是原男性文件；这是明确的恢复快照。生产原源和新输出均保留。
