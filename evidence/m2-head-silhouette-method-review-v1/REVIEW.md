# 真实截面目标的工具接入与共同输入方案

2026-11-16。本轮只读原试验、几何独审、已安装API声明和固定官方源码，没有安装工具、调用优化器、生成新形状或改动旧试验。范围是当前两个原男请求的共同目标装配，八原请求和正式准入门保持。

## 已确定的问题

新附件语义下，23个原生guide最大残差分别约82nm和1.54um，但完整Face_SKIN的101截面仍有9.379861mm和2.638866mm半宽误差。独审将原22条carrier边在同一requestedY重新求交，误差仅.703846/.942434mm。实际更宽极值来自其他皮肤边。lean有59/101截面超2mm，round有5/101，不能用几个固定carrier的精度替代完整表面。

lean最坏slice64的881–885/961–965两边均没有guide端点，round最坏slice30的892–853/972–940各只有一guide端。两最坏截面的z约-67/-62mm，去掉z过滤保持同极值；全域取消过滤的最大误差更大。这支持共同表面包络或完整语义目标装配，不能据此仅提高guide权重、手补这四条边或改z过滤。

固定几何证据为 `evidence/m2-head-attachment-silhouette-diagnosis-v1/result.json`，SHA `4aded23f7395e681ceaceb06d5cd905120d0271b29141543e67981bfbdd5204a`。原失败与实际数据不改标。

## 路径一，完整语义顶点目标继续使用官方b/bc

当前libigl2.6.3的真实API为slim_precompute(V,F,V_init,energy,b,bc,soft_p)及slim_solve(data,iterations)。b必须是真实顶点索引，bc是对应目标，约束为软惩罚。完整Face_SKIN基础顶点已在当前domain nodes里，按精确原坐标映射即可作为更完整的输入。接口没有b数量为23的限制，这条路径无需扩展SLIM求解器。[固定Python绑定](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/src/slim.cpp)、[固定核心约束](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/slim.cpp)

原Head.fit构造target的代码可以只读复用到实际引用的Face_SKIN基础顶点集，保持原公式/参数、head origin、face_lo与mouthMin。其jaw/cheek/chin项主要由头局部Y和X定义。原23点来自前脸截面，扩至整个材质会同时作用于该材质的侧头/耳或其他非原轮廓点，原式没有针对每种语义附着关系另作相容性处理。因此源码支持完整输入，目标相容性仍需独立证明。新公式采样也要和23旧guide逐值一致，不能只宣称同名。[本项目固定原公式](F:/gamemake/scripts/m2-representative-head-cage-v1/head.py)

root已对784个实际引用皮肤顶点作纯目标算术。全表面目标的101半宽误差为.825000032/.941696881mm，无求解；48个skin节点与保留fixed集合重合，其中20个要求非零冲突。直接把全部目标钉入b/bc会给同一个domain节点同时指定不同坐标。带冲突的exact-target tet读回也出现坏值，不能把它当作某个相容控制问题的可行性证据。原结果为 `evidence/m2-head-surface-target-preflight-v1/result.json`，SHA `03bb29dc3d8c916a4fea374bfa75b4102282ec9869b2015bde0576f6d79dad14`。

这条路径的实现差额集中在共同语义目标合同。必须显式解决同坐标fixed-eye优先、记录每个请求与实际目标差、保23guide、重新切完整表面并核全部受控tet。全点位置约束还会约束不属于外轮廓的局部形状，可能带来过约束。即使静态完整target表面符合101门，soft求解后自由点、表达端点和实际新极值仍需重新检查。

## 路径二，官方约束优化器接真实包络/支撑

已安装SciPy1.18.1的minimize(method='trust-constr')配合LinearConstraint/NonlinearConstraint，实际支持一般等式、双边不等式和稀疏Jacobian。固定源码提交为 `e4e854eaa8f18d807cd3496028e257e36caa93cc`。这提供可复用的约束求解内核。库没有本项目Face_SKIN、101截面、原morph或SLIM装配器。[固定约束类](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/scipy/optimize/_constraints.py)、[固定trust-constr入口](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/scipy/optimize/_trustregion_constr/minimize_trustregion_constr.py)

对一个实际截面Y，边交点为t=(Y-y_a)/(y_b-y_a)，q_x=(1-t)x_a+t*x_b，需保原有效边和z规则。实际半宽为全部有效交点max与min之差的一半。两端都必须处理，只有上包络约束可能把轮廓缩掉，只有一对支撑点可能留其他更宽极值。应以全部实际候选交边约束允许包络，同时保证达到目标的支撑，再以原101完整表面函数回读。

当Y/Z和交边身份冻结时，上界可装配为线性行，达到下界仍需真实支撑条件。若位置变化，交边、t、极值及z有效集都会改变，真实轮廓是分段且非光滑的约束。直接把max/min交给默认有限差分会遇到换边与近水平边问题。需要共同的几何回调、有效集/导数规则、数值边界和真实切面复核，不能把冻结carrier矩阵称为完整轮廓证明。

SLIM Python入口没有一般C矩阵、不等式或用户约束回调。SciPy产生的轮廓约束不能直接传进b/bc。可选接法需要额外的目标装配外层，或由SciPy直接优化体积坐标并提供变形能量、tet约束和稀疏导数。前者还会受soft目标残差和新极值影响，后者实际上是新几何求解适配工作，维护成本高于完整语义输入路径。[SLIMData/API](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/slim.h)

当前原域有17226个坐标自由量，包含37114个tet。大规模直接有限差分不是本轮已有执行能力。trust-constr的keep_feasible需要相应不等式初值可行；当前101失败状态不能把轮廓keep_feasible全部设true后假设启动。官方文档也提醒有限差分探针可能越出可行域。成功标志、constr_violation和最终真实几何门均需独立核验。[官方NonlinearConstraint说明](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.NonlinearConstraint.html)

同库libigl.active_set确实已有线性QP绑定，可作为未来冻结线性装配的内核。但固定core声明[Aeq;Aieq]行独立前提，Python包装只在ERROR抛错，MAX_ITER状态不会作为独立返回值暴露。大量相邻截面/成对包络行存在相关性，调用返回数组不足以证明满足约束。这项源码事实不构成第三条试验建议，也不解决动态真实包络。[固定active_set接口](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/active_set.h)、[固定包装](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/src/active_set.cpp)

## 许可与可执行程度

| 路径 | 已有代码与环境 | 本项目尚需制作 |
| --- | --- | --- |
| 完整语义顶点b/bc | 官方libigl2.6.3已在独立Windows venv完成3D smoke和当前两个数值试验；核心及绑定MPL-2.0 | 与fixed-eye相容的共同target合同、重复坐标检查、全表面/表达回读 |
| 真实包络约束 | SciPy1.18.1已安装；trust-constr/约束类为BSD-3-Clause通用实现，本轮没有运行优化 | 几何有效集/支撑/导数、稀疏装配、SLIM外层或直接能量接入、feasibility及完整几何验读 |

两者均无预训练权重或新增收费资产依赖。官方许可证要求保留各自通知，wheel的其他可选模块及bundle许可仍按已归档记录管理。新方法没有现成的VRM表达或服装保证。[libigl许可](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/LICENSE.MPL2)、[SciPy许可](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/LICENSE.txt)

## 当前收敛点

独立语义优先审核已确认，20个冲突全是EyeWhite同坐标引用，位置均在正式请求Y区上方。将这些节点保持固定后，原完整784目标的实际101误差仍为.825000/.941697mm，23guide不变。完整面目标包含有效形状信息，同时需要按请求区和依赖角色装配。

共同源请求带已有明确数据。把原全部101源平面穿过的全部三角及其顶点收集为固定语义集合，得到600三角、363源顶点、343精确native节点，覆盖全部101与原23guide。它与fixed集合交集0，排除了20个眼白冲突。带+保留fixed+frame共1694 controls。来源为 `evidence/m2-head-surface-target-semantic-audit-v1/result.json`，SHA `2276c75b3b8d22c0d9ffea0711f17bb01aa47fcdabd46c79f0ffea5e0886a1f2`，保原source indices及共同选择规则。这份审核只固定集合与统计，没有生成band目标数组，也没有测band目标的实际101误差。

唯一建议的最小试验沿此**完整请求带输入**，继续官方SLIM。对两个原请求使用同一固定源集合和原Head.fit目标公式；把重复源坐标核成同一个目标，冲突拒绝，保23guide目标逐值一致。带外上脸不被额外强制套入原式，保留原语义fixed-eye/neck/frame。预检保存原索引、node映射、请求/目标差、真实101截面和目标tet风险，随后只有root核pin后的一次identity与两样固定20步。soft_p、domain、embedding、2um保护、det>.12、实际101半宽2mm均保持。

精确给定所有bc时，新集合仍会完全控制旧全skin固定语义目标的部分风险tet，lean为旧10个中的8个，round为旧44个中的10个。它们是软目标/固定连接的风险证据，不能推出允许2mm真实轮廓误差的解不存在。反过来，带输入的静态目标符合101也不能担保soft解。后续实际解仍按原门判定，失败保存，不增加点密度、不手补最坏边、不扫权重或迭代。

停止条件为源/node/重复坐标目标身份不一致、原23目标被改写、identity或资源预算失败，以及实际数值门失败。没有数值候选就停止表达/strict后验和角色导出，记录当前共同输入方法的结果。一般包络约束路径保为有明确装配成本的后续选项，本轮不建议再做LP/QP代理试验。

这只是经研究后选择的一条有界输入实验。当前报告没有调用SLIM或产生新形状，root另行授权的准备与实际运行需保独立身份。
