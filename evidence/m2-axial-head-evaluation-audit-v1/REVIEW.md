# 完整源轴向 G 数值读回独审

**没有发现阻断进入既定严格后验的问题；两项只属于 numeric candidate。** 独立重组原 GLB、重算全部源端点 G/J、复现 Float32 表达回读及完整 101 切片均通过。没有继承旧 tet 指标，也没有将函数前置证书替代实际几何计算。未运行 55 状态严格接触、导出 VRM 或游戏验证。

## 原源覆盖与空间

原 GLB 实际引用 POSITION 共 **9911** 点：accessor 7 的 Body 7855 点无 morph；accessor 21 的 Face 2056 点有 54 个 morph。正确的不同端点输入是 **7855 + 2056×55 = 120935**，分 56 条记录；不是 9911×55 个不同源端点。Body 在 55 状态中复用 base。两组共覆盖全部 15 primitive，未引用 POSITION slot 为 0。

独审直接遍历原 GLB 的 indices/属性/target signatures，核每条源记录的共享 accessor、引用索引并集、目标 accessor、offset/count 及全体 primitive 使用者。Face 的共享 POSITION 与共享 54 targets 没有拆散或重新排序；Body 没有被补造表达。source arrays 与原 `Float64(P_float32)+Float64(D_float32)` 重建逐元素相同。Body/Face 节点 67/68 都是场景根，TRS/matrix 为 identity，原 head origin 一致，没有混用变换后的空间。

固定眼 mask 独立从 Iris/Highlight/White 实际索引重建，共 17490 个 base/表达 occurrences；neck 保留原语义的 68 个源索引；另验 8 个 frame 点。完整覆盖未使用旧 113713 点分区；仅 neck mask 与 frame 的既有定义按明确来源保留。

## G、实际 Jacobian 与 Float32 表达

独审未调用生产者 operator，而从已固定 PPoly 系数独立 Horner 求值和求导，重算全部 120935 输入的 G 与 3×3 J。对源点/局部原点、区间选择和显式外段 identity 都作实际读回；最大坐标差 **2.22e−16 m**、J 元素差 **6.94e−16**。全量直接 `det(J)` 与保存的统计一致，并保存了最小 J、最大位移、固定眼、neck 与 Face base 的代表矩阵及来源索引。

| 实际读回 | identity | lean | round |
|---|---:|---:|---:|
| 全部输入的最小 det(J) | 1 | 0.486337476530 | 0.976210641755 |
| det(J)≤.12 的输入数 | 0 | 0 | 0 |
| 固定眼 / neck / frame 原始位移 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| fixed 眼/neck 的 Float32 回读位移 | 0 | 0 | 0 |
| 全源 Float32 烘焙最大误差 | 0.000233 µm | 0.118263 µm | 0.106781 µm |

identity 的全源 G(P)−P 最大误差另从 raw 独立核为 **0**。lean 最小 J 出现在 Body accessor 7、源点 5604；round 出现在 Face accessor 21、源点 893。这些是完整实际输入的数值结果，不是只挑原 23 guide 或沿用段内 q 下界。

54 个真实表达全部按 `G(P+D)−G(P)` 生成 delta：独审由保存映射端点重新计算 Float32 delta，再执行 Float32 base + Float32 delta 加法，与保存的完整回读数组逐元素相同。固定部件既对照原实数端点，也对照原 Float32 base+原 delta 解码，最大误差均为 0。原始 initial-G 与最终 raw 的 source/mapped/J 数组完全一致。

这些是实际有限输入的全量检查。前置连续实多项式证书、数值接缝、浮点执行全域界仍是不同证据层；本次不补称严格全域浮点界或严格跨 knot C1 已证。

## 正式切片与三角诊断

使用完整 Face_SKIN triangles，在原 requestedY、原 `z<−.025 m` 交点条件下独立枚举全部边交点；读取实际 Float32 base，不用附着点、原 carrier 或局部请求带代替完整表面。三个 case 的 101 个半宽与生产者逐项相同：

| 结果 | identity | lean | round |
|---|---:|---:|---:|
| 最大半宽误差 | 7.81e−16 m | 0.825000032 mm | 0.941696881 mm |
| 缺片 / 超 2 mm | 0 / 0 | 0 / 0 | 0 / 0 |

独立核了全部 **501** 组 primitive/表达三角诊断（Body 6 + Face 9×55）。baseline 使用**同一原表达的 Float32 base+原 Float32 delta**，不以更高精度源和导出精度之间的差制造新退化。三组原精确退化、新 Float32 精确退化及非正原法向点积计数均为 0；lean/round 最小面积比为 **0.504904 / 0.521687**。

这些计数仅说明已定义的精确零面积和方向诊断没有新增事件。它们不检查自交、不同部件碰撞、表达接触或闭眼覆盖，也不证明任意近退化不存在。法向与原法向点积是方向诊断，不等同拓扑翻折定理。不得由零计数外推“无 self-collision”。

## 准入边界与复现

可以作为当前两个**头部轴向参数**数值候选交给既定严格后验；只应用 jaw/cheek/chin 四类参数，原 request 中其他身体参数仅溯源，不能称完整 lean/round body preset 已生产。原女裙、舞、4196 与旧 cage/tet 失败均未改变。

`audit.py` 为可重复只读审查，输入/raw SHA 全在 `result.json`；已有结果时拒绝覆盖。首轮审查在所有数值断言完成后遇 NumPy int64 的 JSON 序列化错误，未写出 result；修复审查器序列化后只重跑只读审查，说明保存在 `first-readback-note.txt`。生产者的唯一运行、原曲线和 raw 未重跑/修改。
