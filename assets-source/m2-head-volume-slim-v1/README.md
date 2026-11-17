# 原男 native volume SLIM 有界试验

本包复用已审原男体积域，输入固定在spec.json。prepare只作源/数组/约束读回，不import igl、不求解。prepared.json固定全部输入和实际执行源码SHA。正式执行仅由主线review后调用一次，目录已有generated则拒绝覆盖。

## 准备事实

5742原节点、37114个正向tet；23个原生guide源顶点、4447 protected、8 frame。两原请求均为4478个去重软控制/1264 free，精确重复索引的不同目标被拒绝，本次冲突0。498条记录/113713个source及原morph端点坐标已逐值核源，原embedding identity最大误差1.1641716839774582e-15m。

sourceOccurrenceToNode没有用于端点映射。端点仅通过embedding.npz的simplexVertexIndices原Qhull序+barycentric映射；domain.npz正向tet只供SLIM和tet J，不能混换序。体积域条件数最大4.386e9、最小参考体积4.8145e-17m³，数值风险保留。原域不重建，不调密度。

## 固定执行合同

```powershell
python -B scripts/m2-head-volume-slim-v1/prepare.py
python -B scripts/m2-head-volume-slim-v1/run.py --execute-once
```

第二条是唯一实际求解入口，不能因为读README而另起重复执行。root已接管本次实际执行，作者不并行调用。

1. identity以全部guide/rest protected/frame作软目标，官方SYMMETRIC_DIRICHLET、soft_p=1e5、V_init=原节点，仅slim_solve(data,1)一次。核全部5742节点（含1264 free）和113713端点最大误差<=2um、finite、原tet det>.12、保护/frame和Float32精度。失败停止，两请求不执行。
2. 仅male-long-lean-v2、male-round-stocky-v2，目标从native-vertex-guide.json精确23源点/请求读取。每项从同原域identity开始、同配置，官方slim_solve(data,20)恰一次。没有迭代/权重/密度搜索。body参数保原记录但本头域试验不施加body field、不改人物。
3. 每项保存真实求解节点、约束、实际全部tet J/det、所有被域覆盖的source/morph端点G(P+D)、Float32 base+Float32(endpoint-base)模拟读回数组。全保护节点/端点/frame误差<=2um、det>.12、finite、模拟bake精度<=2um逐项记录。非有限原数组先保存并停止，不让SVD覆盖根因。
4. 原101 horizontal sections沿原surface_widths AST逻辑，在原response的requestedY切实际Face_SKIN表面。主门以Float32 base读回求半宽且误差<=2mm，Float64拟映射另记辅助。源边附着点不是actual horizontal替代。没有实际VRM或GLB导出。
5. SLIMData.energy未被wheel绑定，initial/final能量按固定官方core公式独立回算并标明来源，energy-source.json固定源码SHA。不伪称读取内部energy。矩阵J由实际四个tet顶点求得，另记体积比差供数值复核。

run.py使用专用官方venv，递归监控Popen和全部children，逐子进程检查并累计RSS；600秒/3GiB，2线程，50ms采样。共享页可能重复计数、瞬时峰值可能漏过，故回执明确为sampled process-tree RSS。出现预算停止不重跑。

## 输出边界

正式结果位于generated/report.json、identity/report.json与两个请求各自report.json，run-report.json保进程树/退出回执。失败证据原样保留。状态numerical-head-candidate-only即使通过，也仅涵盖上述数字门。

当前未包含原三角strict contacts、表达嘴牙闭合/接触、真正VRM normals/skin/IBM/UV/images导出回读、衣物或实际游戏/视觉验收。没有public/catalog/runtime写入。原八请求、原v1/v2/whole/head/LP失败保持，不从本次数值结果外推全部脸型可行。

全部可编辑源码在scripts/m2-head-volume-slim-v1。沿官方MPL-2.0 core工具调用，源角色和既有导出许可依原记录。工具/依赖身份沿独立smoke锁定；没有新增依赖或编译。

## 实际运行与重演边界

本次已经执行，不再是待执行方案：identity通过；两个20步请求均未通过几何/保护/真实截面门。round报告遇到NumPy bool序列化错误，原执行exit2；所有原raw均保存，恢复报告在recovered-readback，未重新求解。原script/spec/generated身份保持。

common.receipt对同目录全部py取摘要，后加recover_readback.py会改变重演准备身份；因此现有prepared.json不应被冒认为当前目录可立即重新调用solve的准备。要重演此历史试验，agent必须在单独检出中先保存原证据，独立安装固定工具环境，并将新增recover_readback.py移到脚本目录外（不删除），恢复原4个执行脚本集合；将该检出的generated与prepared.json移到独立归档目录后，再按prepare/run生成新回执。不得在当前工作树覆盖已封结果，重复运行也不得给原结果换标签。工具prepare本身同样保留旧报告，独立安装时将检出的smoke证据另行归档，依requirements.lock及固定wheel核回。此说明不授权本轮再求解，当前尝试预算已用完。
