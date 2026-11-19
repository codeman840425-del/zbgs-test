# 对两个接收方原包的同 ID 严格传输复核

这是制作方的新增观察条件。两个接收方的原严格回执均为失败，原脚本 SHA-256 为 `47e9e89329b9c0745ff3b9f3780dd996037f233496f6a67f968d198adf45cb29`。两个包的首次进程各核过 24 笔，选回角色另产生 10 笔，第二进程各核过 24 笔。[原始报告位置、摘要和取消请求编号](inputs-and-original.json)

首次单身体试验中，orchid 同一请求 `49344.29` 得到 `loadingFinished` 及 12,141,443 字节的传输量。命令返回的 524,288 字节前缀加上后续 11,616,968 字节，得到符合该身体签名的完整 SHA。此前在两包同版浏览器的登记读取均出现 `ERR_ABORTED`。每次观察的条件和原始结论须分别保留。此前单体试验的实际页面脚本已按当时字节归档。[该次完整报告](../m2-rule-stream-cdp-content-v1/orchid-01/report.json) · [单体观察器源码快照](previous-lifecycle.cjs.txt)

新版入口在历史严格入口上增加显式 `--cdp-content`。启动前从受信包和原签选出 15 个资源 URL，再与游戏实际挂入的角色、发布清单和招手动作选中的 URL 核对。对每笔匹配的请求在 `responseReceived` 当场发出 `Network.streamResourceContent`。同 URL 不同 requestId 独立处理，选回角色产生的新请求同样核验。

每笔须同时满足原检查及新增正文检查。原检查要求 HTTP 200、无缓存或 service worker、identity 编码、成功网络终态、实测传输量和 `getResponseBody` 返回的整包字节及 SHA。新增检查要求同 ID 前缀、后缀无重叠、无空洞，完整 SHA 与对应文件相符。任一失败原样保留。每个浏览器进程的新增正文数组最多保留 64 MiB，单笔最多 32 MiB，同时最多 16 笔，最多记录 128 个目标请求。容量不足直接记为失败。该预算只约束新增观察器保留的目标数组，原 CDP 缓冲、协议 base64 和解码时的短期对象另计。进程报告的 `cdpContent` 给出通过数、失败数、每笔请求详情与实际保留量峰值。

## 制作方 CfT 145 实测

| 接收方原包 | 新观察条件下通过原检查的请求（首次 / 再开） | 两项检查都通过（首次 / 再开） | 新增协议命令到达时已完成 |
| --- | --- | --- | --- |
| [orchid](receiver-jaw-orchid-01/report.json) | 34/34、24/24 | 10/34、6/24 | 42 |
| [cedar](receiver-jaw-cedar-01/report.json) | 34/34、24/24 | 7/34、4/24 | 47 |

两包都完成了两次普通游戏冷开。此次观测条件下 116 笔请求均满足原终态、传输量、原正文和哈希要求，其中 27 笔还取到了逐块正文并核准 SHA。其余 89 笔的新增命令均收到 `Request with the provided ID has already finished loading`。两包的合取结果均为失败。四个进程的新增正文数组预留量峰值落在 13,860,432 至 13,891,228 字节，同时最多 6 笔。原接收侧回执与此次制作侧结果分开保存。

## 重放

在制作方主检出 PowerShell 中运行。每次使用尚不存在的证据目录。以下例子运行 orchid，cedar 使用相同入口和对应名称。

```powershell
$n='receiver-jaw-orchid'
$d="F:/gamemake-test/rule-blind-9c72d4fd/output/receiver-cft-replay/$n"
$r=Get-Content "$d/receipt.json" -Raw | ConvertFrom-Json
node scripts/run-fixed-check.cjs "$d/game" evidence/m2-rule-strict-cdp-content-v1/game/check-cold.cjs $r.packageManifestSha256 "$d/records.json" "evidence/m2-rule-strict-cdp-content-v1/$n-01" --published $r.shapePack.indexSha256 evidence/m2-frozen-rule-game-v1/input/previous.json --browser-config scripts/production/fusion-cft145.json --cdp-content
```

CPU 阶段从 F 盘根使用两份真实清单和原签执行新版入口，到达浏览器启动边界。协议竞态、同 URL 多笔、选回、原正文被驱逐或与新增正文不一致、错误终态、传输量缺失、并发上限以及原默认路径均有定向测试。[28 项 CPU 测试](cpu.tap) · [两包 CPU 预检程序](preflight.cjs)
