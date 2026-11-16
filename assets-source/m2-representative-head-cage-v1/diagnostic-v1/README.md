# 一次 head cage 八请求离线诊断入口准备

当前状态为 **prepared-not-run**。原 `2ff35cd0` strict 前置失败、pair47/1007、generated 文件与正常 batch 拒绝行为保留。没有启动 Blender，也没有生成八项资源。旧 package-files 是该失败版本的历史清单，新诊断增量由本目录 files.json 单独登记。

## 精确启动范围

prepare 核原 preflight SHA `da45d4…eab9`、pair diagnosis SHA `39a75b…3b628`、独审 report SHA `8cd638…4b46` 及被固定的真实源输入。仅当原先唯一失败为 male authored Neutral target0 的 pair47/1007，且其他原前置均通过，才生成诊断 plan。未审的新增前置失败或不同 pair 会被拒绝。

独审认定本 pair 原来已有极短 inclusive 交段，modifier 误差使其跨旧 strict 排除带。该分类只解释这份已固定前置。新目标形状中相同的三角 ID 不会自动继承该结论。

正常 run.py 和 production batch 的 passed-preflight 条件没有改变。原 strict `1e-7`、det>0.12、2mm 原表面意图门、眼发/手脚固定接口和全部表达新增 strict 检查都继续执行。诊断仅给这次已独审的旧前置提供一条带标签的离线路径。

## 最小代码增量

- batch.run_source 增加可选 diagnostic 上下文和接触 observer，仍复用原 body/head、响应拟合、donor、表达和导出代码。默认入口继续走原状态与 normal equipment 文件。
- contact_classification 仅抽取已审 probe-pair.py 的纯 Fraction 几何函数。对 source/target strict 并集逐 pair 记录旧 strict、新 strict、exact represented inclusive、交段/距离、逐点逐轴 Float32 ULP。male target0 的原 pair 即使未成为 strict 也继续观察。
- 分类保留 `modifierRelativeErrorBoundM=null`。新目标没有保守的 modifier 相对误差界，不能用最大 ULP 或已观察的旧误差当作安全界。`strict-boundary-crossing-unresolved` 等仅为观测，所有新增 strict 仍进入原 failure 列表。
- diagnostic.py 默认只准备 plan。显式执行时使用同一固定 Blender、两线程、3GiB/600秒停止门。diagnostic_batch 是薄调用层，错误会保存失败回执并非零退出，不重试或扫参。

诊断输出统一 `diagnosticOnly=true/productionAdmitted=false/runtimeAccepted=false`，状态为 diagnostic-unadmitted 或 diagnostic-failed。装备引用用 `diagnostic-equipment.json` 与 `diagnostic-equipment-reference-v1`，没有 normal equipment.json。实际共用 equipment loader 要求 zbgs-equipment-v1，公开批次 publisher 也要求正常的 canonical batch schema，因此这些诊断引用没有直接准入合同。

## 预期命令

从这棵隔离树运行准备和 CPU 检查。

```powershell
python -B scripts/m2-representative-head-cage-v1/qa_diagnostic.py
python -B scripts/m2-representative-head-cage-v1/diagnostic.py --tool-root F:/gamemake
```

七项 CPU 检查通过，包括真实 frozen pair 的 strict 失败保留、额外前置失败拒绝、两种 diagnostic 状态隔离、原 batch 仍拒绝，以及原失败文件哈希不变。测试 mock 了 Popen，保证没有 Blender 启动。

root 明确安排空闲窗口后，才执行下面的命令。本次没有执行。

```powershell
python -B scripts/m2-representative-head-cage-v1/diagnostic.py --execute
```

计划输出固定在本包 `diagnostic-v1/exports/once`，prepare 时该目录不存在。execute 重核 plan/输入/producer 身份，并拒绝复用已存在的执行目录。旧 preparation plan 因补充失败退出条件而保存在 preparation-history，仅保准备历史，没有形状输出。

## 尚未验证

Blender 薄入口、八请求共用响应拟合、全部新表达/装备导出和 observer 的完整成本尚未运行。pair 观测当前定位在共同映射的 Float64 烘焙前坐标，实际 Float32 GLB 接触读回与游戏表现仍待对应检查。表示坐标的 exact 谓词也不能恢复丢失的浮点精度或证明连续混合安全。

若实际执行出现新 strict、det/形状意图/接口失败，诊断会保失败并拒绝准入。即使没有这些失败，diagnostic-unadmitted 仍只供后续独审和根因判断，不授予公开、catalog 或游戏准入。
