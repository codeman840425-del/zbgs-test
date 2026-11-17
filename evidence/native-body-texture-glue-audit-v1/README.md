# 原生 Body 纹理事务独审

结论：当前仅纹理覆盖的原生候选，未发现新增 CPU 事务阻断。实际执行工厂函数、覆盖模块、Three/MToon update(0)、equipment-set 可见性提交；adapter 的依赖拒绝在发布可见性之前注入。纹理解码/fetch 是 CPU 替身，本报告不代表浏览器、阴影或视觉验收。

- `m1-equipment.js:18` 明确拒绝 bodyCoverage / 非空 additionalBodyCoverage / garmentCoverage 与 textureCoverage 混用；三类配置均已实测拒绝。
- 装备提交前依赖拒绝：旧贴图与 shade 引用、装备可见性、debugBody 状态一起保留。
- supersession、放弃 prepared 不影响当前装备/遮罩；成功基础/穿衣来回切换一致。
- 销毁有 pending 的 actor：pending 失效，原基础贴图和内嵌衣物恢复，自有纹理及 adapter 各释放一次，借用原纹理不释放。

原代码审查指出 gear 发布成功后若后来几何 coverage commit 抛出，只恢复纹理而未恢复 gear。没有将此条件风险称为真实原生失败；当前入口明确拒绝组合，真实 createBodyCoverageSet 在空 bindings 时为 null，此候选没有后来几何 participant。未来启用组合必须另外验证，不能从本次通过外推跨任意 participant 原子性。

首个独审 harness 未处理空 bindings 返回 null，包装为非空无 dispose 对象，导致 `coverage?.dispose is not a function`。这是测试接入错误，失败脚本/结果保存在 harness-failure.*，不修改产品来迎合测试；改为保持 null 后通过。initial-pass.json 为补三种入口拒绝测试前记录，最终 result.json 为完整四组。

剩余实际游戏检查：暂停首次换装的 PNG 上传、surface/outline/投影一致；肤色改变后卸衣/重装不丢乘色；双实例快切/销毁；新 ID 与实际资源身份。均由 root 的固定构建检查，本包无 GPU/原生编辑器调用。

复现：`node evidence/native-body-texture-glue-audit-v1/check.mjs`。脚本读取工作树当前源码，结果含源码 SHA；运行会重写本目录 result.json，需先保原证据。未修改 root glue。
