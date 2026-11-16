# 装备覆盖失败清理与保原修复

本次采用 GPT-6.1 Sol / high，范围为实际覆盖集合和 M1 工厂的同步提交、失败清理与资源所有权。修改共享候选，不提交其他 agent 文件。

## 实现

- createBodyCoverageSet 新增 prepareEquipmentSet，先构造完整候选几何，再同步 commit。旧 applyEquipmentSet / setEnabled 接口保留。取消或控制器关闭会释放未提交几何，过期准备不能覆盖后来的状态。
- M1 先准备覆盖，再使用现有装备同步提交，最后更新 outfit/debugBody。装备准入仍由 commitLoadedEquipmentSet 在修改可见性前验证。首次 apply 纳入工厂清理 catch，原衣隐藏延后到成功，失败释放裙修正器、覆盖 owner 与装备适配器。
- 实际 mask/body/item/SHA/逐三角身份检查保持原约束。原 createBodyCoverage 接口没有改动。

## 验证

全部使用独立新输出目录，没有覆盖原独立审查失败。

- equipment-coverage-cleanup-v2/report.json 的 6 组 CPU 门通过。实际工厂首次 clone 失败得到 adapterDisposed=1、skirtDisposed=1、原衣可见、装备提交次数=0，随后同 mesh 能重新取得覆盖 owner。
- 后续 setOutfit 的准备异常保留原 outfit/debug/装备/身体。此用例在实际工厂依赖注入边界强制 prepare 抛错，因为当前只有同一个 top mask，裤型切换正常会复用相同覆盖。setDebugBody 则直接注入真实原 geometry.clone 抛错，验证真实克隆路径失败保原。
- 覆盖 pending 取消、过期 commit、控制器关闭释放、dispose 幂等、双创建并发单 owner、合法重试均通过。实际装备验证拒绝时，已准备几何释放且维持原状态。
- equipment-coverage-cleanup-set-v1/coverage.json 的覆盖并集、重叠计数、outline 分组、区域卸下恢复、全原体恢复、实例隔离与身份拒绝通过。
- equipment-coverage-cleanup-loader-v1/report.json 的现有 qa-equipment-set 通过，使用真实男性身体和服装字节与绑定，替换纹理解码，覆盖迟到请求、加载失败、完整集合冲突和重试。
- git diff --check 通过。最终两个产品文件 SHA 记录在 v2/report.json。

## 保留失败与限制

第一次回归 evidence/equipment-coverage-cleanup-v1 保留为失败。原因是新测试的裙修正器 fixture 缺少 getInfo，已补齐 fixture 后另写 v2，产品源码没有为该测试错误更改。

本轮没有浏览器、动作、GPU、Blender、导出或录屏验证。当前 M1 仍只消费既有真实 top mask，多 mask 并集只取得合成精确索引证据，不表示外套、叠穿服装或任意衣层已适配。并发 owner 结论适用于新集合 API，不扩大到旧新 API 任意混用。
