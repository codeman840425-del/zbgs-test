# 冻结游戏的请求和页面读取时序

冻结游戏 `60e3934ddd8a` 在 CfT 145 的两份独立接收包均完成初次选中，游戏确认两条原签已挂入场景并使用各自签名里的身体和制服。每份报告记录 20 笔网络请求和 20 个唯一的页面时间候选。严格网络状态仍为失败，这次补采的 `networkIntegrity` 为 `not-evaluated`。[接收包 A 实测](receiver-jaw-orchid/report.json) · [接收包 B 实测](receiver-jaw-cedar/report.json)

| 请求类别 | 接收包 A | 接收包 B |
| --- | --- | --- |
| 新身体注册流 | `7804.30`，178 块共 12,141,256 字节，CDP `ERR_ABORTED`。页面操作 1 于 533.1 ms 读完并释放锁。 | `48608.30`，179 块共 12,141,256 字节，CDP `ERR_ABORTED`。页面操作 1 于 540.7 ms 读完，540.8 ms 释放锁。 |
| 身体模型加载 | `7804.39` 新体、`7804.73` 原签同伴均为 `loadingFinished`。页面操作 5、13 的 `arrayBuffer` 分别在 700.5、2,075.5 ms 返回 12,141,256 字节。 | `48608.39` 新体、`48608.73` 原签同伴均为 `loadingFinished`。页面操作 5、13 分别在 724.4、2,222.0 ms 返回 12,141,256 字节。 |
| 共用鞋 GLB | `7804.33` 注册流为 `loadingFinished`，页面操作 4 于 590.4 ms 读完并释放锁。`7804.61`、`7804.95` 两次模型加载均完成。 | `48608.33` 注册流为 `ERR_ABORTED`，但页面操作 4 于 600.0 ms 读完，600.1 ms 释放锁。`48608.61`、`48608.95` 两次模型加载均完成。 |

三类请求均收到 HTTP 200。两包的鞋注册流及模型加载均有 155,976 字节的 CDP 分块和独立的页面字节计数。探针直接记录 CDP ID 下的网络事件、页面对象上的读取操作和场景中挂入的角色。页面操作与 CDP ID 的关系按 URL、方法和时序给出候选，角色选用由相同资产 URL 和包签名核证，请求级归属未直接观测。初次选中分别在 2,559.4 和 2,708.6 ms 被观测到，`pagehide` 分别在 2,573.3 和 2,724.8 ms。到 `pagehide` 为止，所观测的这 40 个页面操作没有 `reader.cancel`、`stream.cancel`、已关联控制器 `abort` 或 `AbortSignal` 事件。取消终态和 `done` 的换算时间相距小于 0.1 ms，两套时钟的精度不足以判定先后。

## 原严格回执

冻结源码 `7857eb77` 的公开包及两份独立接收包各有两次正常打开。三份严格检查共记录九次取消，均返回 HTTP 200，随后 CDP 报 `Network.loadingFailed`、`canceled: true`、`net::ERR_ABORTED`。

| 原始回执 | 首次进程 | 第二次进程 | 原文件 SHA-256 |
| --- | --- | --- | --- |
| 公开包 | `35024.30` VRM | `40224.30` VRM，`40224.32` GLB | `bc791f7cc1c53f836eaca58da950f2985f9c39c7aadcd04da108524f787873d8` |
| 接收包 A | `50772.30` VRM，`50772.33` GLB | `19072.30` VRM | `7876b968c916303cad40a3a856009b35eaa9d8700b34b38f4ac7a00c0d93bc03` |
| 接收包 B | `33992.30` VRM | `42576.30` VRM，`42576.33` GLB | `3b26ad7051ff02dcf9f22de960b63837f66327125cc84ecbc68913569d42a2cc` |

公开包源文件在[原冷开报告](../m2-cft145-tool-v1/cold-cdp-complete/report.json)。接收包 A/B 源文件位于接收工程 `rule-blind-9c72d4fd/output/receiver-cft-replay/` 下的 `receiver-jaw-orchid-strict/report.json` 与 `receiver-jaw-cedar-strict/report.json`，此处保留哈希和请求编号。已用同一脚本读取三份原件核对，第一次的 58 条和第二次的 36 条均为验收脚本保留的请求链数。

原始链已有 initiator、HTTP 响应头和网络终态，缺少分块、时钟锚和页面读取状态。九次取消均来自冻结客户端的注册读取 `pn`。对应源码在读到 EOF 后释放锁，只有超长时显式取消读取器，注册前核对长度和 SHA-256。此前的公开串行复现对两次流式读取核对了实际长度和 SHA-256，仍收到 CDP 取消。[请求栈与冻结源码定位](../m2-cft145-tool-v1/cdp-cancellation-analysis.json) · [公开串行对照](../m2-cft145-tool-v1/stream145.json)

## 采集一次普通游戏冷开

从 `F:/gamemake` 执行，使用已有公开包和一个尚未创建的工程内证据目录。

```powershell
$i = 'output/m2-cft145-tool-v1/issued'
$sha = (Get-FileHash "$i/game/runtime-package.json" -Algorithm SHA256).Hash.ToLowerInvariant()
node scripts/run-fixed-check.cjs "$i/game" scripts/qa-rule-stream-lifecycle.cjs $sha evidence/m2-rule-stream-lifecycle-v1/cft145-public --browser-config scripts/production/fusion-cft145.json
```

报告保留三个观测面。

- `network` 按真实 CDP ID 记录 initiator、HTTP 和终态，并保留各笔 `dataReceived` 的原时间戳、`dataLength` 和 `encodedDataLength`。每笔起始事件的 `clock` 保存 CDP 单调秒和 Unix 秒。需要对比页面时间时，以 `(事件单调秒 - 起始单调秒) × 1000 + 起始 Unix 秒 × 1000` 换算。分块值仅是 CDP 分块观测，严格失败所缺的终态或传输数保留原状。
- `page` 按实际 `fetch`、`Response`、流和读取器对象保留页面操作，含每次读回的字节数、`done`、`releaseLock`、显式调用 `cancel`、已关联控制器的 `abort` 调用、`AbortSignal` 事件和 `arrayBuffer` 完成。调用记录与原生方法调用同一时间段，Promise 结果带观察回调时间。页面使用 `performance.timeOrigin + pageMs` 对齐。诊断关闭的调用和收到的页面关闭通知独立记录；`pagehide` 只在浏览器把该通知传到驱动后才标记观测到。探针覆盖该冻结源码使用的默认流读取器和 `arrayBuffer`，探针上线文中的 Promise 回调及时钟精度可能影响时序。
- `page.game` 按原包检查构建、两条角色签名、实际挂入场景的身体和可见的已选制服；`selectedAtPageMs` 是观察到已选状态的时间。`associations` 仅在 URL、方法和起始时钟窗口双向唯一时列出候选。页面没有 CDP request ID，`directPageRequestId` 始终为 `unobserved`。遇到重定向、多候选或缺时间仍保留原始记录。角色选用对齐到资产 URL 和包摘要，请求级业务归属仍未直接观测。

探针使用既有冻结服务、浏览器配置及项目内临时目录。它不发额外资产请求，不改请求头、浏览器响应字节或 SHA 检查，不录制。报告的 `networkIntegrity` 为 `not-evaluated`。原严格回执仍负责网络验收。

```powershell
node --test scripts/qa-rule-stream-lifecycle.test.cjs scripts/qa-cold-assets.test.cjs
```

从 F 盘根运行，7 项 CPU 回归通过，盘根输出在访问服务器前被拒绝。
