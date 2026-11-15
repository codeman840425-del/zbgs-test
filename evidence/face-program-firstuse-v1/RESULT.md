# 主色 program 首用准备候选（CPU 完成，未测 GPU）

基线为提交 `c4e8096` / 公开 `1fff`。本包 baseline-foundation-avatar.js 已与该提交逐字节核对。产品只改 foundation-avatar.js 并新增 face-program-firstuse.js；facial-geometry.js 与基线逐字节相同。没有构建、浏览器、GPU、shadow/换体预热或性能结论。产品已冻结，精确身份见 final-source-pins.json；之后仅补本说明。

## 接口与顺序

`prepareFaceProgramFirstUse({renderer, materials, signal, compile})` 为最小内部 helper，Three REVISION 必须为187。materials 只来自这批新建 staging 克隆材质，compile 回调沿原 `renderer.compileAsync(staging,camera,targetScene)`；不读全局 renderer.info.programs，不 draw 场景。

1. 保持 shader errors 开启，不替换 onShaderError。
2. 等待 compileAsync。它只等待 currentProgram，不返回材料列表。
3. 从每个 staging material 的 properties.programs Map 收集全部 wrapper，按对象去重；先确认全部 isReady。
4. 每个 getUniforms 前用 setTimeout(0) 让出真实任务，再检查 actor abort、context/property身份、材料Map及原生program handle。不能将Promise微任务当作让步。
5. 原 getUniforms 执行日志/链接诊断及 uniform/attribute 首用。正常无 diagnostics 合法；runnable=false 或回调异常均拒绝。之后仍有一次有效性检查。
6. 整批首用成功之后才登记 warm；调用者 facialGeometry 原 generation/disposed 门仍决定是否提交几何。无新几何算法或时钟。

## 生命周期

- shared warm batch 的信号属于 actor/context，**不属于一次编辑 request**。同 signature 的新旧请求共用完整 compile+firstuse Promise；旧请求取消不释放仍被新请求等待的 staging 材料。仅最新 generation 能提交。
- actor dispose、webglcontextlost/restored 清该 actor 缓存并中止批次；两事件监听在 dispose 移除。renderer.properties 或 context对象更换也使缓存失效。材料Map被原地清空的 renderer.dispose 场景在逐项有效性检查中拒绝。
- compileAsync 无 native abort。我们自己的等待立即拒绝，并 dispose **自有 staging 材料**；Three 187 的轮询对已删properties见 currentProgram undefined，可自行结束。我们不直接 destroy wrapper/改 usedTimes，也不承诺取消已进入的同步 GL 调用。
- ordinary compile/firstuse失败只清 fresh，不删旧有效 stable/其他 pending。成功后仍沿原逻辑淘汰同mesh全部旧material版本的layout，保留现版本必要多layout。旧批次晚结束不能删新context或新版本条目。
- 本候选将原 `.then(success,error)` 改统一 `.then(success).catch(error)`，因此新增首用异常和finalization异常不会绕过清理。

## 定向 CPU 证据

`node scripts/qa-face-program-firstuse.mjs --out <不存在的新目录>`，拒绝覆盖。使用实际导出的女性Face attributes、真实 Three几何和产品 facialGeometry、从产品提取的warm函数、实际import的firstuse helper；renderer/program/context仅为可控mock，不代表真实GPU性能或驱动行为。

最终 `cpu-2/report.json`：24项通过。包含嘴→眼→眉→重叠→复位parts；双面多Map/shared去重、全部ready后才首用；真实任务间隔；无diagnostics成功；diagnostics=false、原shader回调抛错、readiness异常、缺Map、失效handle、禁用诊断六种失败；compile挂起时dispose/loss立即拒绝；首用之间dispose/loss/原地properties清空；恢复后同signature重试及旧compile晚到；20次材质version变化跨layout有界；双actor隔离；真实Face两个反向嘴请求共享warm且仅新请求提交，原样复位及首用失败保原geometry。

`cpu-1`保留首轮23项通过及当时模块。之后只补renderer.dispose原地properties清空防护/对应反例形成cpu-2；非失败被改标。两个目录都有executed-script、foundation快照、firstuse快照。最终源与cpu-2快照逐字节核对。语法与 `git -c core.whitespace=cr-at-eol diff --check` 通过。未重复所有源端点门，因为几何模块/算法字节未变；此前1fff门仍仅属于其原证据。

## 必须由实际测量决定

这是Three 0.187.0内部API，升级需重新核对。isReady只表示KHR编译完成；无KHR也不能保证getUniforms不阻塞。单个getUniforms/onFirstUse仍同步且不可中断。setTimeout允许旧场景/输入任务执行，但不保证每两项间都有浏览器绘制。主色准备不触及首次shadow程序、morph纹理上传或换体成本。

下一实际同输入测量须并列：compile同步块、每program首次使用、旧场景帧/输入响应、总请求时间、提交后first draw和shader日志/GL身份。若只是挪耗时、最大阻塞块无收益，不认定优化成功；未改变验收标准或关闭diagnostics。


## 后续实际结论（主色方案未发布）

01a实测未改善完整最大rAF，已撤回源码候选，公开入口仍1fff。详../face-firstuse-comparison-v1/DECISION.md。原CPU门只证明程序生命周期，不是发布结论。历史CPU脚本新增--source-root选择精确164eaf4独立检出，避免误用当前已撤回的主树；例如 `node scripts/qa-face-program-firstuse.mjs --source-root experiments/face-firstuse-fixed-v1 --out 新输出目录`。保留原执行脚本快照，不给历史结果改标。
