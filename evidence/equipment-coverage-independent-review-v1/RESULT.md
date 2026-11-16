# 覆盖集合独立审查（当前候选，尚有阻断）

已读取完整 M2 新目标。本轮只检查新增 createBodyCoverageSet 和 m1-equipment 接入；不宣称外套/叠穿资产已适配或完整 M2 完成。

## 确认缺陷

首次 `apply()` 位于 m1-equipment 工厂的清理 catch 之外。旧单项构造在 createBodyCoverage 内克隆，失败受原构造 catch 处理；新集合直到 applyEquipmentSet 才克隆，因此引入了新的错误出口。以实际工厂函数（仅装备适配器/配置为 fixture）及实际覆盖模块，注入 original.clone 抛错：adapterDisposed=0，sourceClothesVisible=false，覆盖 WeakMap owner 未释放，同 mesh 再准备被 index layout 门拒绝。见 factory-failure/report.json 与执行脚本。

建议最小修复：首次 apply 失败释放 skirtCorrective/coverage/adapter 并恢复原衣；提交时先准备覆盖再切可见装备，或在后续 apply 失败时恢复装备选择及 outfit/debug 状态，避免未来多层集合克隆异常造成半提交。没有必要放宽身份或覆盖检查。此故障为 CPU 定向异常注入，未观测 GPU OOM；但工厂失败清理的合同应成立。

## 已核通过的范围

- 现有 qa-equipment-coverage-set.mjs 在新独立输出执行通过：mask 并集重叠只算一次，移除恢复、原完整接触 geometry、outline 重复分组、实例分离、错误版本和重复 owner 拒绝。
- 补充并发准备：同 mesh 两个新集合并发仅一个成功，末端注册再次检查有效，无部分注册。
- helper 自身克隆失败时已准备 geometry 会释放，原 render 不变；修复注入后可重试。
- mask SHA/body/item/index/选面逐三角身份检查保持；完整 index 不修改，clone 只供绘制。motion 仍通过 completeBodyGeometry 读全身。
- 相同有效 mask 集合排序后直接复用；非覆盖鞋等 ID 忽略适配当前装备集合，未知装备整体准入应由 equipment 集合负责，不能在此视为任意装备合法。

## 边界

当前 M1 仍只将既有单 top descriptor 转成一元素集合，多个 mask 目前是实际模块的合成精确索引门；无新真实外套或衣层 mask 资源，不继承为叠穿视觉通过。旧 createBodyCoverage 保留未改；本轮并发实测针对新集合，不声明新旧 API 混用任意并发安全。工厂异步创建未返前的主加载器清理不能代替它释放未返回的 equipment 私有资源。

未运行浏览器、Blender、导出或产品修改。原测试输出未覆盖。故障与正常门使用的源码 SHA 已在报告记录，待修复后仅复测该出口。
