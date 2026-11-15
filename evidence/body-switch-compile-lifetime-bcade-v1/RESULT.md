# 新增编译等待：三轮取消资源归还

固定候选 `bcade40d24f1`，由独立固定目录临时服务提供。只使用真实 renderer.compileAsync 的实例方法wrapper：先 await 原公开API正常完成，再在应用提交之前等待gate；请求当前女取消，再释放。没有跳过编译、注入源代码、强制GC、录像或性能测试。

三轮都通过：原female actor / motion / document不变，原场景每mesh的geometry、material容器及逐material对象引用完全不变，loading清理，暂停/模拟时钟/位置保持。每轮真实编译完成但尚未提交时，program从22暂增到28，usedTimes总和106→133；取消settle后等待2rAF，**每一个cacheKey及其usedTimes完整恢复初值**，三轮均22 / 106。geometry / texture始终89 / 44。没有观测到重复取消导致program引用逐轮累积。

随后真实切男、再切女成功并保持同document：男84 geometries / 41 textures / 23 programs，返回女84 / 40 / 24。初始和回女的outfit均为0；返回女是新实例，program比初始多2、usedTimes总和反而从106降为101，geometry/texture也更少。原始逐key差异已保留，但本轮没有进行成功切换的长期循环或逐材质归属溯源，不能仅凭program数量不同认定泄漏或保证完全回稳。

0 pageerror、0 console warning/error。`report.json`保留全部program原cacheKey、id、usedTimes与SHA摘要，不只聚合总数。`summary.json`是离线逐key比较结果。Three资源计数不是实际VRAM；三轮未增长不等于长期/所有路径无泄漏。

所有测试浏览器和临时服务已关闭，未改产品/未提交/未发布。脚本为 `scripts/qa-body-switch-compile-lifetime.cjs`，本目录保留实际执行快照。

```powershell
node scripts/run-fixed-check.cjs experiments/body-switch-compile-fixed-v1/prototype/dist scripts/qa-body-switch-compile-lifetime.cjs --build=bcade40d24f1 --out=evidence/new-unique-output
```
