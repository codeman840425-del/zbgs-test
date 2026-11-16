# C3 contact-resource lifecycle independent review

审查时点为 2026-11-16，输入是当前工作树中未提交的 `contact-resources.js`、`render.js` 与 `authoring.js` 增量。没有修改产品代码、角色代码或提交 Git。

## 复现结果

使用真实 `createCompanyAssetLibrary` 和仓库内 `lounge-sofa/v1` GLB，fetch 仅把真实 `prototype/public/company-assets` 文件读入并通过可控 gate 延迟 `preload`。运行：

```text
node evidence/company-c3-contact-independent-v1/reproduce.mjs evidence/company-c3-contact-independent-v1/run-03
```

两项检查通过，结果见 `run-03/report.json`。

- 活跃接触句柄会使真实文档替换被 `facility-busy` 拒绝，因此没有把仍有效的句柄交给新文档。
- 在 retain 等待真实 GLB 加载时提交真实沙发位置变更，加载按 `isCurrent` 返回 `contact-resource-stale`。作者会话保持活动，但 `authoring.retainUsePointContact` 没有 `try/finally` 调用 `prune`。真实 asset library 最终保留 1 个已加载 GLB，复现报告记录 `loadedAssetsAfterFailure: 1`。

## 实质问题

1. 失败 retain 的缓存裁剪缺口。`authoring.js:73-77` 只在成功拿到 handle 后调用 `prune(generation)`。`scene.retainUsePointContact` 的等待可能因设施版本变化、接触资源失败或过期而抛错。`authoring.js:25` 的 `prune` 只会由 transaction 的 finally 或成功 retain/release 触发，因此失败路径留下 `assetLibrary` 中的资源。最小修复是在 `retainUsePointContact` 的 await 外层加 `try/finally`，在会话仍 live 且 generation 仍有效时执行 prune。若 dispose 也拥有该 library，应在会话销毁路径明确释放会话专属缓存，避免把 disposal 当作永久保留。
2. contact record 保留了旧楼层对象树引用。`contact-resources.js:74` 将 `source` 原对象写入每个 record。该 `source` 来自 `render.js:158-166`，包含 `visible` 使用点对象、`preload` 闭包和 `isCurrent` 闭包。可见楼层时 `visible` 指向 `current.points` 中的 chair/seat/back Mesh，它们又指向旧 facility root。`render.js:175` 切换视图后会 `disposeTree(current.root)`，但 record 仍能通过 `record.source.visible` 追溯整棵旧对象树。几何已 dispose 并不等于 JavaScript 引用释放，违背 contact store 只保留两面独立接触资源的目标。

最小修复是在 `load` 完成捕获后把 record 的 source 降级为纯元数据快照，只保留 `usePointId/documentId/revision/facilityId/resource {id,version}/facilityTransform/transform` 等 handle 和 busy 检查所需字段。`visible`、`preload`、`isCurrent` 只在 pending load 阶段使用，不能进入 `records`。`handle` 目前只读取 `record.source` 的快照字段，因此不需要保留这些闭包。

## 未发现的问题

当前实现用 `contactResources.isBusy` 参与 `prepareChange`、`commit` 和 `restore` 的设施忙碌检查。活跃句柄下替换被拒绝，释放后替换可继续。pending retain 在文档发生变更时由 `isCurrent` 拒绝，未伪造新文档的接触身份。

## 范围限制

只做 CPU Three、真实 GLB asset library 和可控异步 gate 验证。未运行浏览器、GPU、角色动作或完整 C2/C3 套件。`run-01`、`run-02` 是本次脚本失败修正前的保留目录，最终复现以 `run-03` 为准。
