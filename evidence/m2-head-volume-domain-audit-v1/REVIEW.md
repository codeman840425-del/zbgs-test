# 实际male体积域独立审查

**结论：无源点/控制索引/保存嵌入错误阻断同一域的一次原生SLIM identity。尚不批准把体积预检通过当成两项形状成功；identity求解本身尚未由本审查执行或验证。** 下一步无需重做Delaunay、删点或改架构。

请求配置继续为已明确的gpt-6-astra/high，未另核provider/hook。本审查只读取固定源、JSON及NPZ，用独立脚本重算点集、索引、体积/面关联和既存插值；没有调用Delaunay、SLIM、Blender或修改root产物。27项检查全通过，细节见同目录 `result.json`；可复查脚本 `audit.py` 拒绝覆盖已有结果。

## 已独立核实

- 从VRM实际primitive索引重建点集，精确等于5742个保存节点；所有选中base/原表达端点的113713条实际引用记录与源P+D逐值一致，语义记录无缺/无增。
- 原23guide索引和坐标完全匹配native-vertex-guide；4447保护节点包含眼发与颈接口，8个外框角正确。组合原生b共4478个不同节点、无冲突，全部被tet引用；另有1264自由节点。因此4点全软约束的旧工具smoke没有覆盖此真实内部自由度问题。
- 37114tet均正向、有限，按局部 `smin > 3*float64eps*smax` 仍为数值rank3；面出现次数只有1或2，12个外边界面全在外框，总正体积等于bbox体积。这里没有声称体积质量适合变形。
- 保存的embedding原序每一项都对应真实tet；重心坐标和为1，最小约−4.26e−14是边界求解量级，未夹取/重归一化。独立identity、affine读回仍约1e−15m量级。
- 最坏局部条件数仍约4.386e9（独立SVD约4.385980499e9，原报告约4.385980251e9，浮点计算路径差异）；最小体积4.81454e−17m³。rank3与插值精度不能证明SLIM全局系统、导数或line search稳定。

## 两个必须固定的消费规则

1. `embedding.npz:barycentric` 必须与同文件 `simplexVertexIndices` 配对。后者保留Qhull原序；`domain.npz:tetrahedra`已交换18531个负向tet的两列。两套保存本身正确。若拿同一tet的正向序去套旧重心权重，本数据最大identity错为 **0.106654540m**。下一脚本必须显式消费保存的I/B，或同步置换权重，不能按tet行号直接替换I。
2. `domain.npz:sourceOccurrenceToNode` 是原 `controls + base_sets` 拼接的去重inverse；**不是**113713个 `sourceEndpointsM` 的node-map。它用于审计原节点来源可行，端点必须用endpoint-records的offset/count和embedding。无需改旧文件；在下游变量/合同中写清含义并加长度断言即可。

## 下一次identity及两项形状的关键边界

建议先在原节点/原tet上做一次独立identity SLIM，`V_init=V`，b由23guide+全部保护+8框组成，bc全为对应rest位置；保持原固定能量/soft_p/预算，明确是world metres还是既有 `(V-head)/scale` 归一坐标。若用归一坐标，V、V_init与bc必须同变换，最终误差一律换回米；不能把1m单tet的软权重精度外推成当前模型已固定。

identity后检查所有节点与全部113713端点的实际漂移、有限值、保护/颈/外框≤原2µm；以真实tet的 `J=D_new*inverse(D_rest)` 或相应体积比检查原 `det>.12`。**最小tet体积不是这个无量纲det门。** 记录薄tet最坏J及能量/实际返回状态；不把小的世界坐标漂移外推为导数稳定。源neutral/表达接触的已知strict边界问题保留，不能自动以“identity所以浮点忽略”豁免新增交对。

若identity返回非有限、预算失败、异常漂移或原门失败，停止，不进入lean/round；保存实际solver输出，不通过删近重点、密度/soft_p扫描或降低det门挽救。identity通过后，male-long-lean与male-round-stocky仍应各从**同一rest域新建solver状态**，不得把前一形状结果当下一初值。一次共同配置、各一次，不按结果改变目标公式。

形状阶段仍须分别报告23guide残差、202材料点残差、原101 requestedY真实重新求交半宽、颏长度/投影实际值。formal门是后者的真实半宽≤2mm，不以guide≤2mm替代。眼发/颈/框均为soft b/bc，只能以实际≤2µm读回宣布保护；不回钉输出、不取消外框来得到形状。

全部tet局部正向仍不保证原输出皮肤三角与口内没有新增strict交对：原表面三角并非都在tet边界上，原边跨单元后的直线重建也不等于连续体积映射的曲线。表达须沿共同映射处理，保存原拓扑/绑定及 `G(P+D)-G(P)`，在实际float32导出/读回上再验接触与截面。此次没有衣物、游戏动作、女性、普通电脑或恢复准入证据。

已有预检足以支撑一次有预算的同域identity，是本审查唯一推进结论。高条件数的真实影响留给该测试；不能用未知风险要求先重建体积，也不能先宣布稳定。
