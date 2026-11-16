# 换体上下文保护独立审查

**结论：6e4801f 当前限定修复未发现阻断问题。** 它防止换体准备跨越已失效的 WebGL context 后仍提交新人物，不承诺所有资源请求立即取消或所有上下文恢复场景均已覆盖。未修改产品，未运行浏览器/GPU。

审核提交 `6e4801f6f69c13af44adf7e7ceb014868cbc6631`；当前 main/helper 与该提交无差异。实际 SHA：main `749d2ea1ac62b09afbf6a2df0bcf7d6e1c19d3c0f6edd28c487b0dac050e953e`；guard `ed54874e897ee0302b253fb4fa7fc5b35ae39217edff888f119faaeee61d8726`。main SHA 与原25项 CPU 报告一致。

- 每次真实换体独立创建 guard；lost 与 restored 都永久失效该请求，不能恢复后把旧准备当新 context 成果。入口、compile wait 开始/完成、同步提交前均检查。最后检查到所有权转移之间无 await，正常浏览器事件不会插入该同步区间。
- compile 等待中的失效立即拒绝外层等待，finally 释放未提交 avatar/motion 并移除两个 canvas 监听。底层 compile 不被物理中止；其晚 resolve/reject 都已有处理器，不再写全局 actor，也不产生未处理拒绝。原 source/controller/task 在提交前保持不变。
- 原 generation 门仍在。当前人物取消请求先递增 generation，旧请求晚完成不提交；catch/finally 只有最新 generation 写 error/loading。新请求创建新 guard，旧 guard 的失效不传给新 guard。context 丢失时仍可能返回失败 reason 而非 cancelled，但不会覆盖新请求界面状态。
- `dispose()` 只解绑 canvas，不主动 abort 任意未完成 wait。当前唯一调用方在 switch 的 finally 中使用；正常 settle 已完成，loss 路径已 abort，因此此合同足够。不要将 helper 当作可随时 dispose 即可取消任意任务的通用设施。

## 已核证据

原 `body-context-guard-cpu-v1` 25项包括原 load/compile/姿态/UI失败、准备中的最新状态、current-body取消与晚拒绝，以及本次3项 context 场景。其 source 是真实 switch 函数，actor/renderer 为受控 fixture，不是 GPU 测试。

本次新增 `check.mjs` 实际调用当前 helper，6个轻量 CPU 场景通过：loss 后晚 resolve/晚 reject；wait 已完成、commit check 前失效；同步throw；异步reject；成功。晚完成与恢复新 guard 并存时新 guard 保持可用；每次 dispose 后 lost/restored canvas listener 都为0。Node EventTarget+受控 Promise 故障注入，不冒称自然浏览器事件。

已读取真实故障注入 `body-context-recovery-460-v2/report.json`：build460b72813f68，WEBGL_lose_context期间female保留/loading清/明确失败，restore仍female，重试male成功，再回female成功，errors为空。此处仅独立读日志，没有重看录像，也没有把v1录像收尾QA失败抹除或换标签。

## 限制

loadFoundationAvatar、动画加载、appearance.set 前置 await 没有接入 abort race。若 context 在这些等待中丢失，guard会记住失效并最终拒绝提交，但等待仍须由原资源请求自行结束；无限挂起网络不保证立即清loading。这是本次compile保护之外的取消范围，不应称全部异步加载可即时取消。

真实证据为一次主动扩展触发的 context 丢失/恢复，不等于自然驱动故障、长期可靠性或目标机性能。等待中的底层compile可能继续持有自身资源直到settle；本审查不对driver资源回收时间作承诺。

复跑最小门：`node evidence/body-context-guard-review/check.mjs`。
