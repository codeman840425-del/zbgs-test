# 有帧 HTTP 响应的受限 Blob 对照

CfT 145 已完成两进程共 72 项实测，67 项与预期一致。两个读取器在页面内均完整读回原签身体和鞋并核对 SHA。旧 reader 的身体、Blob 候选的身体及鞋都未取得合格的 CDP 响应体和传输证据。候选还在身体和鞋的传输中主动取消时各报一次网络错误，未保留预期的主动取消原因。连同上轮 pipeTo 对照，两种改法都没有改善身体的严格读取结果，产品保留原读取器，本轮停止调参。[逐项实测](cft145-01/report.json)

本次只比较读取方式。原始普通包、已签角色以及上一次 reader/pipeTo 脚本保持原身份。旧脚本原始文件 SHA-256 为 `d92142fef93170b76b3a9f3be1215c9493232f8827d2248637d8b1da97acabe3`。

直接在原始响应调用 `blob()` 时，应用只能在读完后检查 Blob 的大小。响应头里的 Content-Length 描述消息长度，不能给调用方提供独立的解码字节预算。HTTP/2 长度不匹配可以在传输已经开始后才显现。即使检查当前页面的 service worker controller，也无法单凭此值证明每个响应的来历。因此排除把裸 `response.blob()` 用作通用有界读取的方案。[Fetch Body](https://fetch.spec.whatwg.org/#body-mixin) · [RFC 9113 §8.1.1](https://www.rfc-editor.org/rfc/rfc9113.html#section-8.1.1)

对照将同一接收方的 12,141,256 字节身体和 155,976 字节鞋分别交给逐块 reader 和有帧候选。候选要求同源 HTTP(S)、basic 响应、URL 精确相同、无重定向、无 transfer encoding、无内容编码或 identity，并要求明确的正 Content-Length。浏览器还须有可检查的 service worker 接口且当前页面无 controller。在有帧条件下，声明长度大于已签文件长度时立即取消。仅在长度精确匹配时，将解码流经计数 TransformStream 送给原生 Blob。过限块在入队前拒绝，结束时核对精确字节数；只有 Blob.size 合格才分配游戏数组并验 SHA。其余响应继续逐块读取并检查。CfT 测试在全新进程中屏蔽 service worker 和缓存，并采集 CDP 的实际响应标记。

该上限针对交给 Blob 或写进游戏数组的解码字节数。浏览器网络队列、解码器送出的单块、同时存在的合格 Blob 和游戏数组以及 WebCrypto 内部暂存仍会占用内存。报告不测量进程峰值内存。

## 重放

从任意目录启动。最后一个路径必须是制作工程内尚不存在的目录。CPU 版本追加 `--cpu`，CfT 145 版本省略该开关。每种方法使用独立浏览器进程，磁盘写入逐次结果，`firstFailure` 保留最早异常。正常资源必须满足应用哈希/字节和独立 CDP 取回体哈希/传输量要求。负例则保留应用拒绝阶段和原始 CDP 生命周期。HTTP 取消事件的发起方须结合主动中止测试中的阶段另行判断。

```powershell
node F:/gamemake/evidence/m2-rule-framed-read-v1/check.cjs F:/gamemake-test/rule-blind-9c72d4fd/output/receiver-cft-replay/receiver-jaw-orchid/game 5ae993bf95c95fc807aeee391f21a3d19724c8a6161edb70e0296535d2a45bec receiver-jaw-orchid F:/gamemake/evidence/m2-rule-framed-read-v1/cft145-01
node --test F:/gamemake/evidence/m2-rule-framed-read-v1/read.test.mjs
```

CPU 的 [72 项实际 HTTP 回执](cpu-01/report.json) 包含正常、声明过大、完整短响应、断线短包、chunked、gzip 及各自解码后超长、同长错误 SHA、重定向、503、合成响应和模拟 controller。主动中止覆盖 fetch 前、响应头后、传输中、核对 Blob.size 后及摘要生成后。旧 reader 没有 Blob 阶段，对应单项正常完成。HTTP/1.1 的真实短声明由协议建立帧界；独立的五项 [边界单测](read.test.mjs) 直接送入声称满足帧长后继续发字节的流，检验上游不诚实时仍拒绝。service worker 分支用显式控制状态注入，未安装真实 worker。
