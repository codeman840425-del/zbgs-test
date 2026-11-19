# UAL 动作库的 Chrome 冷开兼容性

旧固定构建 `f4966554bcfc`（源码 `4636fe861238ed25aa2a4725ff1e5becf328cb5d`）的收件方在 Chrome for Testing 145.0.7632.6 用原装和扩展冷开检查各实跑了近、远两包。首轮已建立准确签名的人物、验证当前上衣并拍到画面，零页面错误。检查随后因 `Network.loadingFailed` 失败，第二次冷开未执行。扩展日志用 Playwright `requestfailed` 将该事件关联到 `/assets/motion/UAL1_Standard.glb`。原项目同一构建在 Chrome 157.0.8103.79 的近远两包均通过两轮冷开。[融合原装回执](/F:/gamemake-test/native-studio-round/registration/body-texture-f4966554bcfc/evidence/vanilla-browser.json) · [融合扩展回执](/F:/gamemake-test/native-studio-round/registration/body-texture-f4966554bcfc/evidence/browser-index.json) · [扩展报告及 URL](/F:/gamemake-test/native-studio-round/registration/body-texture-f4966554bcfc/operator/receiver/cold-far-20261119-002019/report.json) · [本项目旧包通过记录](../m2-cc0-body-release-game-v1/cold-far/report.json)

## 同资源、同服务器的读法对照

A/B 均读取同一完整 GET 响应，HTTP 200，7,618,436 B，SHA-256 `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`。包装组按 Three 的进度读取方式消费原始 `response.body.getReader()`，将收到的块送入 `new Response(new ReadableStream(…))`，最后读取包装响应的 `arrayBuffer()`。直接组对原响应调用 `arrayBuffer()`。四轮页面内均取得完整匹配字节，唯一异常为下表中的 Chrome 145 包装组。[受控试验及事件原始数据](isolated-read.json) · [复现实验入口](isolated-read.cjs)

| 浏览器 | 包装流 | 直接读原响应 |
| --- | --- | --- |
| 145.0.7632.6 | HTTP 200，字节与 SHA 匹配，CDP `loadingFailed/net::ERR_ABORTED` | HTTP 200，字节与 SHA 匹配，CDP `loadingFinished` |
| 157.0.8103.79 | HTTP 200，字节与 SHA 匹配，CDP `loadingFinished` | HTTP 200，字节与 SHA 匹配，CDP `loadingFinished` |

## 归因与修复

- 固定动作加载器首先等待 UAL 的 `GLTFLoader.loadAsync`。Three `FileLoader` 逐块读完整流，再交给 GLTF 解析。后续 jog、dance 请求和人物挂接依赖该步骤成功。这里没有只读状态码后放弃响应体的存在性探测。常规 HTTP 夹具返回完整文件与 `Content-Length`，这一调用未设置 Range。角色的取消标记没有传入该动作 GET。接收包中近、远两份 UAL 均复算匹配。相同夹具的独立 Node HTTP 请求也取到同一完整 SHA。 [旧动作加载](../../experiments/worktrees/cc0-body-4636fe86/prototype/src/motion-source.js#L51) · [动作就绪顺序](../../experiments/worktrees/cc0-body-4636fe86/prototype/src/character-record-consumer.js#L66) · [固定 HTTP 夹具](../../scripts/run-fixed-check.cjs#L12) · [收件方独立 HTTP 回执](/F:/gamemake-test/native-studio-round/registration/body-texture-f4966554bcfc/evidence/http-motion-far.json)
- 实验把旧包的停止定位到 Chrome 145 对这一包装读法的网络完成事件。已有数据能同时证明完整响应和旧检查失败。Chromium 内部触发条件、其他浏览器或其他服务器组合仍未测。普通电脑性能和视觉范围沿既有证据。
- 最小兼容改动限定 UAL 本身。用直接 `fetch`、正常 HTTP 检查和 `response.arrayBuffer()`，核相同的固定 SHA 后交给 `GLTFLoader.parseAsync`。并发演员可共享尚在进行的字节请求，各自解析独立的源骨架；成功或失败后清除在途引用，以便重试。独立 CPU 用旧包实际字节直接解析得到 43 段动画、全部 8 个启动必需片段及 pelvis。保持错误拒绝，冷开检查继续要求实际动作 GET 完成、摘要一致、完整角色首开和关闭再开通过。旧签包和失败回执保留，效果由新固定构建证据确认。 [窄改动位置](../../prototype/src/motion-source.js#L51) · [检查入口](../../scripts/qa-garment-cold-package.cjs)
