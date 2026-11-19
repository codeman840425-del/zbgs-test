# CfT 145 读取对照

从普通包清单固定实际输入，并重算所选签名。orchid 的身体文件为 12,141,256 字节，鞋为 155,976 字节。脚本为每种读法新开一个受信 CfT 145 进程；同一进程先测身体再测鞋。正常控制使用文件流、原资产路径、HTTP 200、Content-Length 和 no-store。

从项目根运行以下命令。目标目录必须是工程内的新目录。末尾追加 `--cpu` 可用同一组 HTTP 输入在 Node 中测试应用语义。

```powershell
node evidence/m2-rule-stream-ab-v1/check.cjs F:/gamemake-test/rule-blind-9c72d4fd/output/receiver-cft-replay/receiver-jaw-orchid/game 5ae993bf95c95fc807aeee391f21a3d19724c8a6161edb70e0296535d2a45bec receiver-jaw-orchid F:/gamemake/evidence/m2-rule-stream-ab-v1/cft145-replay
```

每个对象、每种读法各完成正常、少一字节、多一字节、等长改一字节、主动中止、HTTP 503 六项。主动中止时，服务端先发送一小块并保持响应打开，客户端收到第一块后调用 AbortController。每项结束即追加 `attempts.jsonl`；完整回执保存 `firstFailure` 和全部试验。正常和两类完整传输的错误数据均分别核对 CDP 终态、响应字节、摘要及传输计数。CDP 报告失败但应用读全时，两方面的观测均保留。中止原因需结合显式调用记录解释。

两种读法只分配一个固定大小的应用层解码目标数组。每块在复制前检查剩余空间，读完须精确足量并匹配摘要。pipeTo 的同步写入端逐块消费，队列高水位为一块。此上限只覆盖应用层累积的响应内容，浏览器内部缓冲、WebCrypto 和事后 CDP 核验的内存另计。

Node CPU 使用首个接收方的实包完成 24 项，全部符合预期。[CPU 回执](cpu-01/report.json)

在已批准的 CfT 145 上，两种读法分别用一个新进程重放这 24 项。完整的 orchid 身体在两种读法下都读满并匹配摘要，二者的严格网络检查都没有拿到成功的完成事件。普通鞋在 reader 下取得严格完成，在 pipeTo 下仍报取消。每种读法的截断、溢出、错摘要和主动中止仍在应用层被拒绝。此次试验没有将 pipeTo 合入游戏。[逐项结果及首败](cft145-01/report.json)

原普通游戏的观测另按请求编号保留。两个角色中都观察到了读满的注册流和实际挂入场景的身体，页面探针未观察到显式取消。网络编号和页面流对象只能按 URL、方法与时间作关联；`canceled` 字段自身不能确定发起者。[原普通游戏的逐请求记录](../m2-rule-stream-lifecycle-v1/README.md) · [Chromium 中生成该字段的位置](https://chromium.googlesource.com/chromium/src/+/94280f3a5b4cf51e48f73a92b1a3e81e8112750f/content/browser/devtools/protocol/network_handler.cc#2783)
