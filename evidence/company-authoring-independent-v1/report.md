# C1制作集成独立审查

继续已知显式请求配置gpt-6.1-sol/high，任务难度complex。检查authoring、render和document的异步事务、实际材质与接触引用。本轮未自验asset-library实现，仅把它作为真实GLB加载依赖。实际provider配置及桌面Hook拦截未独立验证。

9个有界案例中8项通过，1项复现产品缺陷。initial-report.json保留本次产品失败及完整输入SHA，document-world-recheck.json补充独立计算的复制世界坐标。未修改产品、提交Git、启动浏览器/GPU或联系总工。

## 已复现问题

向沙发设施新增一个合法非阻挡子组件后，提交文档含sofa-badge，但实际scene树找不到该组件。该CPU夹具复用现有键盘几何并移除其桌面安装要求，作为明确的非阻挡引用样件。render.install只比较座位设施自身有效node，忽略子树差异，因而保留整棵oldRoot并释放带新child的候选placeholder。此后文档和画面不一致。复现步骤在review.mjs的Adding a legal child案例。

## 实际通过范围

- 延迟真实沙发GLB的load在后发edit完成后返回revision-conflict，不能回滚文档、root或实际屏幕材质。延迟apply在后发load后同样拒绝。dispose期间迟到的真实加载不能重新添加场景root。
- 合法metadata下放大程序桌面触发visual-outside-room。放大键盘实际几何但保持合法安装原点触发visual-surface-overhang。两种失败都保留有效root、文档和持有的沙发座面引用，原座面dispose事件为0。每个失败候选36个geometry、29个material均清理，未释放计数为0。
- 真实沙发外观只修改6个fabric网格，5个frame网格颜色保持原样。左右usePoint有不同局部frame及不同seat mesh，并属于同一设施。后续无关屏幕编辑保持这两个引用与保存的fabric编辑意图。
- 坏materialSlots目标在真实模型中找不到mesh时返回missing-material-target，保原有效场景并释放候选的36个geometry和29个material。
- 拆开工位、重新组合及拆组合保持6个部件的世界坐标和设备父关系。复制组合在旋转房间下符合独立计算的世界Z减6m，其余坐标与朝向保持，并拥有独立新身份和内部父依赖。

## 夹具纠正与边界

首次错误地采用旧facility-catalog作为新authoring入口输入，缺少placement要求的使用空间字段，已改用实际preview的library-catalog。20m自建布局又被声明的保守0.2m网格判为无法连接，异步案例改用现有可运行base/studio布局，没有把此保守拒绝报产品错误。键盘几何路径也改为实际group下的child。

释放计数现在跳过Object3D.clone内部暂借的缓存资源，只统计真正安装进候选的实例对象。首次未排除该过程，把仍属asset library的11份缓存几何计成泄漏，已纠正。初始夹具错误分别保存在fixture-initial-report.json和fixture-placement-report.json。

占用回调和接触引用均为CPU夹具。没有真实角色、占用状态机、GPU画面、人物接触、导航或C3集成通过结论。
