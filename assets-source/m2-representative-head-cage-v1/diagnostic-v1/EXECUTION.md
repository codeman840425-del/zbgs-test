# 单次八请求诊断封存

准备源码为 `9649f3c65eac0d76235b7f23d59104367c8383b6`，plan SHA 为 `baa2cc50caf792b6523d60523143941306a1962b8464856bd873b0fad585bf9b`。在 root 释放窗口后执行了一次，全部八请求完成，均为 **diagnostic-failed**。没有第二次形状生成、参数调整或接线修复。

运行耗时 226.22 秒，峰值 RSS 368.84MB，固定两线程，资源停止门未触发。最终 exitCode=1 是几何/表达/意图失败的明确拒绝，batch.failure 为 null。窗口已释放。

| 请求 | 最小记录 det | 实际半宽最大误差 mm | 全表达新增 strict pair 数 |
| --- | ---: | ---: | ---: |
| female-round-full | -5.181971 | 43.311 | 2 |
| female-long-slender | -1.858163 | 15.546 | 5712 |
| female-square-athletic | -2.365170 | 26.575 | 2 |
| female-soft-wide | -5.687945 | 47.168 | 2 |
| male-wide-muscular | -2.223954 | 29.301 | 35 |
| male-long-lean | -0.303291 | 15.431 | 555 |
| male-round-stocky | -4.564349 | 45.726 | 23 |
| male-angular-athletic | -1.245838 | 11.556 | 41 |

pair 数是各单独表达帧的计数之和，包含边界不确定情况，不是全体独立穿透或穿透深度。女57、男55帧的旧 strict、represented inclusive、逐轴 ULP、未知相对误差预算均保存于各 report。门没有通过精度分类放宽。

实际32个资源已独立 CPU 读回，节点、skin/IBM、拓扑、UV/JOINTS/WEIGHTS、材质/图片与原 binary 前缀保留。原眼/髪被引用点的 base 和全部 Float32 表达端点位置差均为零，八项报告的远端中性位移为零。全部装备引用仍为 diagnostic-equipment-reference-v1，source report 和总 manifest 均不可生产准入。

## 根因核查入口

`execution-summary.json` 保存实际控制环排序、宽度符号、源/目标面坐标和所有表达的反参考法线面。8/8 前侧 Y 链出现反序，6/8 前侧左右宽度反转。最大控制点位移约0.714–2.483米，请求脸部尺寸变化为厘米级。`head.py:Head.fit` 使用没有 cage 方向/位移可行域的 ridge 最小二乘，这是明确的失效控制几何。

中性实际 Face_SKIN 反参考法线面计数为女 round6/lean62/square4/soft8，男 muscular4/lean68/stocky2/angular26。Body_SKIN 中性没有反参考法线面。女 lean 的 FaceMouth 中性另有4面。具体三角 ID、原点与 target 坐标，以及 raw head-local centroid 在 summary 中，例如 round 的 Face_SKIN 65/67/87/273/281/870，lean 女口内240/250/328/338。

反参考法线表示相对源表面法线转过90度以上，不能直接等同 ambient Jacobian 的负值。原生产报告只保存最小 det 标量，没有最坏采样点索引，因此本包不能声称已定位该标量的精确面。可在固定 source/target 下用原 `preflight.numerical_jacobian` 对 summary 中的相关顶点复算，范围应覆盖原 base/端点和 donor。

弱或相关的受保护区域响应可能导致大控制系数，这是待完整 A 取证的假设。空间 blend 的 `d_cage ⊗ grad(w)` 项也可能进一步反转局部场，尚未分项求导。未把这两个假设写成已证根因，也没有修改 ridge、precision、原八参数或保护范围。

独立 CPU 读回可重跑。

```powershell
python -B assets-source/m2-representative-head-cage-v1/diagnostic-v1/readback.py
```

该入口不调用 Blender，不重导出。它检查实际 Float32 资源身份与表面参考方向，未重复全部 artifact 接触扫描。原批次的接触观察定位于 Float64 烘焙前共同映射，post-bake 接触、混合表情、动作和视觉均没有准入结论。
