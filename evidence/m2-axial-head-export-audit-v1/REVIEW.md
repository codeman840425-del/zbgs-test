# 真实轴向 VRM 导出与十个混合状态独审

**导出属性通过；混合表情没有全部通过原“无新增 strict pair”尺度。** lean 在 `happy=.65、blink=1、oh=.66` 的边界组合新增 1 对口内/脸皮 strict 交叉。其余九组合未新增口内交叉；眼部三类接触比较未新增。不能据此宣布 runtime/视觉准入，也不把边界组合说成自然运行时钟必然会同时达到。

本包只读实际 identity/lean VRM 和 sealed expected/raw；未重导出、改资源/profile、重造曲线、运行 solver 或重跑原 55 单目标 strict。组合是离线数组求和，**没有执行真实 manager/GPU**。

## 实际文件属性

固定生产者 manifest SHA `0ecf529f22f587515d0cbf2db20a6f3f7aa29390d0ee89e1b232ebc3bd227012`。实际 identity SHA `1278357bfd3c0513af67f3e67760ec3d6063baebc1f5305de76d00a4e39041bf`；lean SHA `83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9`。没有 round 导出。

`audit_export.py` 核原完整 binary 前缀、原 accessors/views 前缀、nodes/skins/IBM、UV/JOINTS/WEIGHTS、索引/材质/图片字节、VRM expression JSON、mesh extras/targetNames 与其他原 JSON 属性。所有均保留；允许的变化仅是已声明的新增位置/法线数据引用及 generator/长度。

全部 15 primitive、2 个共享 POSITION 组均检查；Face 九个消费者共享同一套 54 POSITION + 新增 54 NORMAL targets，共 **486** 个消费端点引用。没有只核一个代表 primitive。实际 Float32 base+delta 与 sealed endpoint 数组逐值一致。

| 读回 | identity | lean |
|---|---:|---:|
| 最大 POSITION 烘焙误差 | 2.328e−10 m | 1.183e−7 m |
| 最大 NORMAL 烘焙误差 | 0 | 7.542e−8 |
| base 作者 N 与原源最大差 | 0 | 0.625909（预期变换） |
| morph NORMAL delta 最大值 | **0** | 0.351457 |

normal 不是重算法线后归一化原作者 N：按已封 `normal_map` 的 `max|J−I|>1e−6` 分支，对原作者 N 做 J 逆转置并恢复原 N 长度；每个表达取其自己的 P+D 上的 J，delta 为端点 N′−base N′。独审以三角 J 的显式方程另算逆转置，与线性求解差 ≤3.331e−16；实际导出 Float32 NORMAL 与该 sealed 策略逐值一致。identity 没有触发变换，**作者 N 完全保留、新增 54 NORMAL delta 全零**。这不代替真实灯光、阴影或 outline 检查。

## 十个组合：比较相同权重的原源与 lean

`check_combinations.py` 从真实 VRM preset/bind 和 targetNames 确认 happy→ALL_Joy/4、blink→EYE_Close/11、五元音→28–32、EYE_Joy/15；两文件映射相同。按 actual Float32 属性解码后用 Float64 顺序求和，仅 Skin/White/Eyeline/Eyelash 索引施加 `−happy*blink*D_EYE_Joy`，其余五类不施加；corrected/protected 源索引无交集。原源同样使用这一补偿模式，避免把原 legacy 与新 fixed 混作前后对照。

沿用冻结 `contacts/segment_hits` 的 strict 非共面边穿三角规则，原 determinant `1e−12` 与重心/线段 margin `1e−7` 不变；每状态都重新读取**同混合状态**的原源基线，未借原 55 状态基线。

| 组合（happy / blink / 元音） | 原口内–skin 对数 | lean 对数 | 新增 |
|---|---:|---:|---:|
| 0 / 0 / 无 | 0 | 0 | 0 |
| .65 / 0 / 无 | 0 | 0 | 0 |
| 0 / 1 / 无 | 0 | 0 | 0 |
| .65 / .5 / 无 | 0 | 0 | 0 |
| .65 / 1 / 无 | 0 | 0 | 0 |
| .65 / 1 / aa=.66 | **36** | **34** | 0（移除 2） |
| .65 / 1 / ih=.66 | **8** | **8** | 0 |
| .65 / 1 / ou=.66 | 0 | 0 | 0 |
| .65 / 1 / ee=.66 | **30** | **30** | 0 |
| .65 / 1 / oh=.66 | **8** | **9** | **1** |

因此“新增为零”也不等于“没有交叉”：原源已有 aa/ih/ee/oh 混合问题。十状态各九类 Face 的新精确退化和非正原法向点积均为零，混合作者 N 有限且最小长度约 .985741；这些只是相应诊断，不取消 strict 见证。

## 新问题位置

新增 pair 为 **FaceMouth triangle 128 ↔ Face_SKIN triangle 1020**，实际源顶点分别 `[224,227,225]`、`[1381,1382,1379]`。精确状态见 `combination-09.json`。`locate_witness.py` 对已发现的这一个 pair 另解边/平面线性方程，原同组合六条边均不满足 strict 内部条件，lean 有两条满足：

- mouth 边 224→227：`t=.147136378, u=.172125065, v=.825291181`；交点 head-local 约 **(6.533, 2.212, −93.792) mm**。
- skin 边 1382→1379：落在 mouth 三角的 `v=.000509597`；原同边 `v=−.000263187`，原在三角外、新在内。

完整世界/局部坐标、边参数及原/新三角保存在 `oh-new-pair-witness.json`。这是脸部中心线正 X 一侧的口内/脸皮见证；交点和 barycentric 参数不是可见穿透深度，不依据数值大小发明可接受阈值，也不称已测视觉严重程度。新 pair 与原同皮肤三角已有的邻近 mouth pairs 一并保留。

## 眼部范围与实际房间候选剩余项

十状态检查 White↔Skin、White↔Eyeline、White↔Eyelash：**原与 lean 的 pair 集合逐项相同**，不是仅总数相同。原基线本就非零，例如 full blink 时为 8 / 38 / 24；不能把眼睑闭合接触等同外观失败或以零接触作为新门。十状态 White/Iris/Highlight 的组合位置与原源完全相同。未计算 alpha/材质遮挡、投影覆盖、视线或所有眼部 self-collision，故闭眼覆盖仍待视觉，不增加虚构距离阈值。

当前文件可用于带明确限制的最小房间**检查候选**，但不能标记完整合成表情通过。root 后续至少应核：

1. 用 **83f490…b8f9** 的新身份加载真实 factory/manager；确认新 profile/负 EyeJoy 补偿确实启用，原 54 targets、新 NORMAL 与私有材质 lane/实例隔离没有丢失。不能借旧 male SHA 或旧“delta 等同”登记证明。
2. 在 4196 同镜头近脸、正常房间镜头及前/45°下查看 happy+五元音、半闭/闭眼、眼角/睫毛/眼白、嘴内和法线/outline/shadow。对新增 oh 见证留同权重原源/lean对照，先分清实际可见表现；不把它静默改成通过。
3. 复用既有 1× happy+speaking/自动 blink 片段与权重 trace、回 neutral、暂停零 dt、双实例/卸载恢复；自然时钟实际到达的组合和上述人为边界组合分别记录。此包没有替代这些运行检查，也没有批准更改系数、源目标、原 strict 门或封存舞/裙。

身份属性核通过与合成问题是两个独立结论。所有输入/输出 SHA 在 `export-result.json`、`combination-results.json`，每组合独立保存；旧 55 strict 结果保持原范围。
