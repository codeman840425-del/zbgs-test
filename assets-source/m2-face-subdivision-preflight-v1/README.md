# 男源一级共同细分前置：属性可消费，跨 accessor 接缝暂阻断 G

只执行一次官方 `libigl 2.6.3 upsample_matrix(F,2056)`，没有 G、候选 contacts、VRM 导出或 runtime 改动。原源 SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。本包只涉及两个新目录。

实际运行 1.693 秒，进程树采样 RSS 126455808 字节；上限 120 秒/2GiB/2线程，无超限。采样不是瞬时峰值。`spec.json` pin 原输入及执行源码，`generated/run-report.json` 保存执行结果。`summarize.py` 只读本次输出与源属性标记材质，没有重复细分或形状计算。

| 实测 | 结果 |
|---|---|
| 完整 Face 九消费者 | 2056 点/3168 三角 → 7251 点/12672 三角；5195 新边中点 |
| 拓扑 | nonmanifold edge 0、重复无向面 0；所有子片 parent 支持集合已核；源中性每子片有向面积严格为 parent 的 1/4 |
| 同一 S | 全 54 POSITION targets 使用同一 S；原 2056 点及全部原 deltas 精确保留；直接端点与 base+delta 差 0 |
| 骨权 | 原点和新点全部只有 1 个有效 joint；权重和误差 0，无 >4 点，无合并后截断 |
| 坐标重合、索引不同的边 | 199 组；其中 159 组 UV 不同、199 组作者 N 不同，morph/骨权差异 0；原索引保留，没有焊点 |
| Face–Body | 41 条精确重合边，全部原 morph 位移 0；其中 **20 条进入 G 的支持区**，不能据本前置准许 Face-only 加细后直接运行 G |
| 原骨架 LBS 诊断 | source-rest 误差 0；raw head yaw20°+neck pitch10° 误差 ≤2.293e−16m；两眼 yaw10° ≤1.963e−17m。是显式源骨姿诊断，不是录制动作、真实 manager 或普通电脑验收 |

**具体阻断关系。** 20 条均连接 `M00_000_00_Face_00_SKIN` 与 `M00_001_01_Body_00_SKIN`。例如 Face `[812,814]` 对 Body `[587,590]`，head-local Y 为 `[.0041222572,.0250554085]`m；Face `[1825,1830]` 对 Body `[4338,4340]`，Y 为 `[.0365085602,.0505423546]`m，跨支持上界 `.0414066315`m。全部对应边、primitive/triangle/source IDs 见 `face-body-seam-materials.json`。Face 新中点未来会按 G 求值，Body 若仍保原单条弦边，两侧没有共同采样保证；**本包没跑 G，因此没有测到或声称确定的裂缝大小**。这是停止进入下一形状步骤的未闭合接口，不是宣称标准 VRM 无法表达细分。

**strict 接触门不能直接换成 child 计数。** 使用原 `segment_hits` 未改阈值：合成父三角一次严格命中，同几何切成四片后恰落新增边，四片均不计；将穿面线段在交点切半也均不计。完整数值见 `strict-boundary-negative.json`。这不是候选通过/失败，而是判定接口反例。后续需要 parent provenance、原边界与新增边界区分、交点去重及原严格内部条件的对应读回；不能通过新 triangle ID 或重心 margin 的含义改变抹去原失败。当前包没有实现新判定器，也没有降低门槛。

`source-and-subdivision.npz` 保原/新位置、54 deltas、属性、joint ID/原权重/按 joint 合并后的完整权重、原/新面、parent 与新边来源；`subdivision-matrix.npz` 保实际稀疏 S；`provenance.json` 保全部消费者与 target 签名；原源码/原资产保持。`closure.json` 是最终前置结论：**hold-before-G-unresolved-cross-accessor-seam-and-contact-provenance**。root 决定下一包是否闭合这两个共同接缝；没有自行扩 Body、加密、焊接、运行 G 或生产八体。
