# 两真实 POSITION 组共同一级细分：采样接缝闭合，四骨消费阻断

本包只读原男性源并实际执行 Body/Face 各一次官方一级细分，共 **2 次 `igl.upsample_matrix`**。原 source SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。没有 G、真实候选 contacts、导出、权重截断、焊点、runtime 修改或后续加密。两个原包的失败/closed 状态保持。

唯一原源前置耗时 **4.756 秒**，进程树采样 RSS **166252544 字节**，限额 120 秒/2GiB/2线程。采样非瞬时峰值。其后 `close.py`/`support_readback.py` 仅给已存数组加材质和支持区标签；`qa_parent_scale.py` 只做合成判定反例，没有重做原源细分。

| 实测组 | Body accessor7 | Face accessor21 |
|---|---:|---:|
| 原/新点 | 7855 / 27581 | 2056 / 7251 |
| 原/新三角 | 12008 / 48032 | 3168 / 12672 |
| 完整消费者 | 6 | 9 |
| morph targets | **0** | **54** |
| 最大有效 joint 数 | **6** | 1 |
| 新点 >4 joint | **482**（452 个5骨，30个6骨） | 0 |

两组原 ID、原 POSITION 和原 morph deltas 精确保留，全部真实 targets 各共用本组同一 S；没有给 Body 虚构 morph。原索引/材质/UV/作者 N 缝保持，连续属性使用同一 S，骨权按 joint 身份合并，未平均 JOINTS 数值。原 edge-manifold/无重复面前置通过；每个子片的原 parent 索引与 3×3 parent bary 矩阵已保存。Body 中性子片有向面积对 parent/4 最大差 2.168e−19m²，Face 为 0。

**41 条跨 accessor 源边的采样接口已闭合。** 两侧新增中点精确相同，按实际 skeleton node 对齐的权重逐项完全相等；两侧都有对应半边、不再保留未拆父边，因此这 41 条已声明源缝没有 T 节点。对应原 Face 54 morph 位移均为 0。记录见 `cross-accessor-seams.json`。没有声称所有任意几何接缝都已发现，也没有运行 G 后的间隙检查。

**当前四 influence 消费合同明确阻断。** `overflow-7.json` 保存全部 482 点/源边/parent/完整权重；`closure.json` 标记具体材质例：Body_SKIN 新7890（源13–17）5骨；新8003（源60–61）6骨；Tops 新22708（源5755–5762）5骨。不能静默取最大四项，也不能把 glTF 理论上可表示额外 JOINTS 集合当成本项目 loader/shader 已支持。

蒙皮中点不是一般的表面插值：三种**显式原骨姿**沿既有 glTF FK/IBM/LBS 公式计算，未录制动作、未运行真实 manager。Body rest 与眼 yaw10° 最大差 1.972e−9m；head yaw20°+neck pitch10°最大差 **2.644386583mm**，位于 Tops 新22708/源5755–5762/材质三角1818（组内 parent9158）。Face 三姿差≤2.293e−16m。保所有权重仍存在 Body 差异，不能把 >4 截断当成其唯一原因；这里没有制定新的可接受蒙皮误差门槛。

## 只读补核：overflow 与已封 G 作用区

使用已存 `group-7.npz` 和旧前置的固定支持元数据；head-local open slab 为 **(-.09536004066467285, .04140663146972656)m**，未求值 G。

| overflow 所属材质 | 点数 | 源边端点 Y 范围(m) | 源边跨 slab | 至少一个 parent 三角跨 slab |
|---|---:|---|---:|---:|
| Body_SKIN | 255 | [-.515825272, -.017904997] | 38 | 40 |
| Tops | 210 | [-.282661676, -.035974503] | 85 | 87 |
| Bottoms | 17 | [-.533919930, -.432683706] | 0 | 0 |

合计 **123 条 overflow 源边跨 slab**，都至少一个端点在内；没有两端均外但贯穿 slab 的边。**127 个 overflow 点关联的 parent 三角跨 slab**，其中 4 个的源边本身不跨。最大 LBS 差的 Tops 源边 Y 为 `[-.113944411277771,-.06195664405822754]`m，跨下界；其 parent 三角也跨，2 顶点在内。故这些问题**不全来自与头部作用域无关的全身加细**。相交只表示源几何支撑区域关系，不证明 G 位移非零或特定细分一定必要。全部 482 点/父三角分项和三个姿态最坏点见 `overflow-support-readback.json`。

## parent 接触分类前置的实际范围

`contact_seam.py` 保原 `1e−12` determinant cutoff、`1e−7` strict 内点常数。先记录闭合子片域的有限线段交点候选和 child bary，再映射到原 parent bary；**原 parent 边的子段**映回原边 t 后才按原 parent 内点条件分类。没有将 child 内点 epsilon 改小来假装通过。determinant 先除以源子段参数跨度和目标子片在 parent 参数域的面积比例：在仿射细分下回到原 parent 尺度，同一 cutoff 才保持原意义；非线性后这是局部 parent 参数导数，不能冒充旧粗弦三角值。

已实际通过的合成检查：原 parent 命中但新 child 边界漏计被恢复；源边切半后落子段端点的命中被恢复；真正只触原目标 parent 边界或原源边端点仍拒绝。补充尺度例：原 parent det 4.096e−12 / child det 5.12e−13 时恢复原 parent 命中；原 parent det 5.12e−13 时仍拒绝。数值与 lineage 全存 `synthetic-contact-classification.json`、`synthetic-parent-determinant-scale.json`。

**它还不是完整碰撞准入器。** 新增的原 parent 内部源边没有旧原边 t 语义，目前返回 `accepted:null / unresolved-artificial-source-interior-edge`，不偷偷接受或忽略。闭域候选的浮点近边界、切向事件、共面/CCD和完整自交也未解决。只有上述有限合成分类通过，不能声称所有真实候选或新增内部边通过。由于本包同时出现明确 >4 消费阻断，按任务停止，不扩成新碰撞框架。

实现来源复用已核的 [libigl 2.6.3 bindings](https://raw.githubusercontent.com/libigl/libigl-python-bindings/1336e57322356b6b7fa66119bccd658c6a127cdf/src/upsample.cpp) 与 [MPL-2.0 core](https://raw.githubusercontent.com/libigl/libigl/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/upsample.cpp)，没有安装工具。parent 分类是本包薄接缝代码，不冒称官方 libigl 碰撞实现。原低级 `segment_hits` 用 AST 精确读取用于合成对照；原文件/原判定阈值未改。

最终状态：**blocked-four-influence-format-and-incomplete-parent-classifier**。保存实际 S、全部两组原/新属性、54 morph、每子片 parent bary、全权重、IBM/源姿态矩阵与误差。到此封存，root 决定后续共同方法；本包不自行第三轮造网格，不因关节/接触缺口放宽原门。
