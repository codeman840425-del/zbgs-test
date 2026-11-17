# Refined contact 合同独立审查

当前封定 prepare 没有未解决阻断。状态仅为 `prepared-stopped-before-real-contact-queries`。未重跑 root 八项官方 smoke，未查询真实候选 contacts，未求 G、导出或改变旧 strict/准入门。此次独审只写本 evidence 目录，不提交。requested 配置沿记录 gpt-6.1-sol/high，实际 provider/hook 未独立核验。

最终合同 spec SHA 为 `980ca15963135e6f0da7b9b44464183ea6abccbd86a0a46455fc7396785a7e48`，13 文件 package SHA 为 `f976cce14b02f83a1dd8a7652d275850dc2db5b4a545dc2c0093f1c495bc0910`，逐项长度/SHA 均核一致。prepared report SHA 为 `f44ca832ff0c6184aff01f7f70e14f2ba762247e46544dc12983d772299fe300`。完整已读文件身份在本目录 `result.json` 的 pins 中。

## 官方接口

root 的 `check.py` SHA `2dca0e20dbb586e950b4049b14d0b677813b0757a17c857c6d6b50a32efe702c` 与报告一致。实际 native SHA `43e7f5b1593b7b13ac1e0d15f09d65863dc67a148dcfab8abefff3d7ce04165e` 也与报告一致。

固定 binding 返回 IF/VVAB/FFAB/JAB/IMAB 五个数组，C++ 的 bool 不在 tuple 中，docstring 多列的 success 不能作为消费依据。固定 core 的 detect_only/double 分支使用 Epick 的 triangle `do_intersect`，first_only=false 收集完整命中，cutoff 传给 box 遍历。remesh 分支受 detect_only=false 控制。root 既有 smoke 的 1100 对用例支持 cutoff 不作为命中上限。本审查只读该结果与接口源码，没有重复 native 调用。参考 [固定 binding](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/src/copyleft/cgal/intersect_other.cpp) 和 [固定 core](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/copyleft/cgal/intersect_other.cpp)。

`intersect_other` 是两个集合之间的 inclusive 检测，不自动应用 PMP self_intersections 的拓扑相邻排除。当前实现没有借用后者的保证。只检查点、边、共面或横向相交是否命中，不返回相交维度或穿透深度。Epick 的精确谓词解释针对送入的浮点几何，不能写成连续理想 G 或精确交点已证明。

README 已正确区分 libigl 单个源文件 MPL、wheel 的 GPL/MPL 组件及 CGAL 分包许可，没有把整个 copyleft 模块概括为 MPL。仍为已有本机离线工具，没有进入浏览器/游戏包。上游固定源码、已安装 wheel/native 身份和八项 smoke 分别有记录，尚未独立从该上游提交编译并证明与安装二进制逐字节相同。

## 数据消费与来源

source/candidate 使用相同的 7251 点、12672 child、3168 parent 拓扑。9 个 consumer 对 child 和 vertex 的分区、parent bary 和相反补偿 lane 不共用索引均有实际检查。官方返回 query-local pair 被映射成真实 global child ID，原生重复行保留并单列，不因 set diff 而丢失原始输出。

`compare_pairs` 先比较 child pair，再归并 parent。QA 中旧 `(0,2)` 与新增 `(1,2)` 映到同一 parent 组合，仍报告新增 child。`sharedRefinedVertexIds` 是真实索引共享，`exactCoincidentVertexCornerPairs` 和整片坐标重合是独立观察。当前不焊接不同 ID、不按这些标签过滤，也没有把“已有 parent”当作所有 child contact 的豁免。

单态采用每侧自身 Float32 base 与 Float32 delta 的 Float32 加法，再转 Float64 交给检测器。混合使用原有顺序对已编码的 Float32 组件作 Float64 加权和，source 与 candidate 都用同一 corrected 材质 mask 和 `−happy×blink` 的 EYE_Joy 补偿。known-oh 的 Float64 source/A/B 归因 lane 与该 baked 消费 lane 分开。没有声称 CPU 加权过程与 GPU 算术逐位相同，也没有为 B 虚构其余 55/10 状态。

原 strict 与新 inclusive 各自保留身份和含义。新基线是相同 refined topology、表达权重和精度规则下的 source/candidate，不能直接用原粗三角 strict 对数抵消新细三角 inclusive 对数。当前没有真实扫描结果，没有借零 hits 宣称视觉通过。

## 已解决的身份缺口与唯一必要反例

最初读到的 WIP 只以 known-oh 四条 lane 重组约束候选 group，不足以单独验证其余 targets 与已过数值 raw 的关系。作者随后补了 producer package 绑定，以及按真实 endpoint-record offset/count 对 base、全部 54 Float64 delta、55 Float32 单态和原 source baseline 的逐项回读。本审查实际对三项已存 case 调用最终输入读回，全部通过，没有执行检测。

本目录 `probe.py` 仅增加一个实际数组反例。将真实 identity group 的 target0/vertex0 的 X delta 增加 1 mm，并同步其 Float32 组件后，Float64 与 baked known-oh 坐标仍完全相同。当前 package 绑定拒绝替换资源，独立完整 raw helper 明确以 `Face group delta differs from numerical raw target 0` 拒绝。该反例没有改原输入文件或计算新 G，fixture、当前拒绝和未修改三项 case 的结果保存在 `probe-result.json`。

复制 WIP snapshot 时，package guard 已在两次读取之间先行落地，因此保存的 snapshot 本身也拒绝替代资源。首轮 probe 对“保存 snapshot 会接受”的预期不成立，已在 `probe-first-attempt.json` 中保留这一事实。没有制造或声称一个已保存旧 loader 接受的实证。最终结论依据当前完整 raw 拒绝和正常输入读回。

## 建议与限度

没有为当前停止态 prepare 追加泛化门。未来若 root 为合格新目标授权真正扫描，应继续使用该同一 source/candidate 编码和 child-first 比较，保存完整 native pairs、原 parent、已存在/新增差异与未分类接触。新点/边接触与原 source 已有接触不自动等于有害穿透，需保几何及视觉尺度，旧 strict 对照仍独立。

现包按用户造型反馈停止，`fullCandidateQueriesEnabled=false`、admissible=false、runtimeAccepted=false。当前已定义的 55 单态仅 mouth-skin，10 混合仅 mouth-skin 和三组眼部关系。没有 whole-body、衣物、头发、姿态或连续时间碰撞结果，也没有为已被拒绝的造型继续扫描或导出。本审查不授权后续执行。
