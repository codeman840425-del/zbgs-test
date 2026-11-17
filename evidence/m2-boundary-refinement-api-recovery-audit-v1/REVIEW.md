# Boundary API recovery 独立审查

没有发现新增源拓扑前置阻断。此结论仅覆盖原 male62b、固定 41 边/39 parent 和已封实际数组，不代表 G 后形状、内部边接触、表情穿插或游戏通过。未运行 Blender、G、contacts 或导出，也未修改 producer。requested 配置沿记录 gpt-6.1-sol/high，实际 provider/hook 未独立核验。

作者 23 文件 manifest SHA 为 `423bd021c2578a7a997db6d476ab444301039785230823ad7da33ddf0fd83a44`，逐项长度及 SHA 全核一致。spec SHA 为 `f3614abd0a19e6a0e704c789a407d4e2c2372be30dd2ea8b032e9a1dd746dad9`，worker SHA 为 `6aafbc34c07baced90cc77067595f2144a57c8286db696b4e744fb218ba48de9`。独审机器结果是 `result.json`，schema 为 `boundary-api-recovery-independent-audit-v1`，其 pins 记录实际读入文件 SHA。

首轮失败不是原 source 顶点消失的证据。已存小三角诊断中，subdivide 前 3 个旧 BMVert wrapper 全有效，之后全失效，但 live 集合仍有原三个坐标与 ID。新增中点继承了整数 ID 2，形成 `[1,2,3,2]`。实际原源也记录 7855 个旧 wrapper 全失效。因此旧 wrapper→source-ID 字典不能在该操作后继续作为有效 BMVert 使用，单独信任插值后的整数层也会混淆新旧点。

新恢复先从官方 `geom_inner` 识别本次新增 BMVert，再要求其相邻源边 ID 唯一，将其标为该边的负 tag。随后从 live 集合恢复正 ID 1..7855，并强制完整、唯一、坐标/权重保持，负 ID 也须与选中边集合一一对应。triangulate 后再次恢复。实际保存的 41 个负 tag 全唯一、对应全部选中边，恢复不使用最近点或坐标容差。其完整正 ID 唯一性由已固定源码中的拒绝断言与实际操作成功回执支持，最终数组另从原源逐项核对，没有依赖旧 Python wrapper 来确定属性来源。

独立读回结果如下。

- Body 只新增 41 点，7855→7896 点，12008→12049 三角。真实源边的精确几何重复闭包仍为 41，没有遗漏的额外相同几何 Body 边。
- 39 个受影响原 parent 为 37 个切 1 边、2 个切 2 边，分别产生 2/3 个 child。11969 个未影响三角的原索引顺序完全一致。全部 parent 有覆盖，child 的稀疏来源仅落在本 parent，bary 非负、和为 1，方向/面积分解及 parent 面积和全核一致。所有未选原边保留。
- 原 source P、UV、作者 N、原 JOINTS 四槽及 WEIGHTS 完全保持。新增 P/UV/N 都精确等于原数组经保存 CSR S 的 `.5/.5` 行插值，未用 BMVert.normal 代替作者 N。新增点最大 1 骨，全 Body 无 >4 影响截断。原 joint-node 列表、IBM 及全部 69 个源 node-local 矩阵一致。
- 全部 36147 个 BMesh loop UV 记录对应实际 child/parent 面角集合，且精确等于权威稀疏 UV 的 Float32 编码。相对 Float64 权威中点最大差为 2.9802322388e-8。后台顶点坐标相对权威 Float64 中点最大差为 5.9604644775e-8 m。它们只用于 backend 读回，权威数组保持原 S 来源。
- Face 复用固定 7251 点和 54 targets。base 和全部原 target delta 分别对实际原 VRM accessor 重放同一 S，逐项一致，未新运行 Face subdivide。
- 41 个跨 accessor seam 中点位置、完整 joint-node 权重、两侧半边均一致，原整边均已拆分，声明接缝没有 T 节点。所有 Face seam morph delta 为 0。
- 对保存的 3 个有限 LBS palette 独立计算，Body 的最大稀疏插值误差为 `[0,2.25914018e-16,0]` m，41 seam 的每姿差均为 0。它们不是实际运行录像，也不证明任意动作连续过程。

首轮独审曾误要求 backend Float32 UV 与权威 Float64 中点逐位相同，失败保存在 `audit-first-attempt.json`。核实精度后改为保留 Float64 S 精确重放，同时检查 backend 等于其 Float32 编码并单列误差。producer 文件未因此改变，未把这个审查断言错误记为资产缺陷。最终独立数组检查约 1.75 秒，不是目标设备性能数据。

## 后续接触合同建议，仅研究

成熟 triangle–triangle 检测可以让新内部边不必拥有“原边 t”才能获得判定。CGAL 6.0 PMP 文档以真正共同拓扑边/顶点定义相邻排除，triangle soup 接口还明确依赖相同 point IDs。源几何坐标重合不能自动变为相邻。其固定源码使用 mesh/point ID 检查共享边，许可标记为 GPL-3.0-or-later 或商业许可。本包只读官方资料，未检查本机 CGAL 安装或构建新工具。参考 [CGAL 6.0 intersection API](https://doc.cgal.org/6.0/Polygon_mesh_processing/group__PMP__intersection__grp.html) 和 [v6.0 self_intersections.h](https://raw.githubusercontent.com/CGAL/cgal/v6.0/Polygon_mesh_processing/include/CGAL/Polygon_mesh_processing/self_intersections.h)。

建议另立明确版本的检测合同，保旧 strict 结果作为对照，不宣称两种定义等价。

1. 同一基线应是本次固定细分拓扑的原源 `S(P+D)` 与候选在同一 child topology 上的实际 Float32 端点/混合状态。输入 point IDs、child IDs、材质及 accessor 组成、相邻排除规则、表达权重和浮点编码方式必须一致。不能直接拿原粗网格 strict 对数减去新细网格精确对数。
2. 先在 child pair 层对比 source/candidate，再用保存的原 mesh/primitive/parent ID 归并展示。保留新增 child pair 及 witness，避免已有 parent pair 吞掉该 parent 下新发生的另一个 child contact。parent map 用于来源和归并，不用来一律忽略同 parent 的 child pair。
3. 实际 source-ID 拓扑相邻才应用成熟库的共同边/点语义。Body–Face 或 UV 副本的坐标重合若 ID 不同，先保其基线接触与 seam 标签，不自动焊点或当拓扑相邻排除。需要统一拓扑时，应先有显式、已核的一对一拓扑映射及新版本身份。
4. 如需精确交点/witness，应固定支持精确构造的 kernel，并保输入 Float32/Float64 二进制数的精确值。这里的“精确”针对实际离散输入，不证明连续 G 表面不交，也不消除源数据自身的浮点边界。
5. 用同一新合同先核 refined source 基线，再核候选，分别记录 source 已有、新增、移除及退化，保旧 strict 的已知 oh witness。新检测器的准入尺度由 root 明确，不能因换检测定义自动撤销旧失败或写成脸部穿插已经解决。

这些建议可以减少继续为每条新内部边增加来源补丁的需要。实际成熟库接口接入、有限合成样例与本项目 refined source 基线还没有运行，本次拓扑前置结果不代替它们。
