# 两人接替使用公司固定麦架

[打开本地录像](index.html)。第一段从接近和预约开始，第二段从重新打开游戏开始。CPU 使用固定的 1/60 秒步长，浏览器使用自身实际帧时钟。录像速度为 1×。

| 固定输入 | 身份 |
| --- | --- |
| 原男女记录 | `evidence/m2-uniform-lite-operator-v1/records.json`，SHA-256 `d38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989` |
| 公司站麦与两间房 | `vocal-use-v1.1`，公司构建 `7255eee31b85`，继承来源及原房间存档随合包清单核对 |
| 修复前角色 | `5c132423 / 07a8411e1fe9` |
| 修复后角色 | `95adfb27 / 6c3c7b43ae35` |

工作室的旧版在第 408 个模拟帧到达作者脚点后立即测量。此时只有一脚支撑，步态权重仍约 80.5%，支撑修正降低髋部约 8.3 厘米。口到网面为 31.63 厘米，超过固定麦架的上限，因此同一男角色在租用间成功，在工作室失败。修正版等双脚实际站稳后测量，工作室第 436 帧就位。男角色站唱时根据拾音点做小幅上身调整，脚点、网头、距离和角度限值沿用发布数据。女角色在两房的稳定口距约 32.6 厘米，按实测结果退出。公司包没有升降状态；不同高度需要已适配的资源或设施能力。[独立逐帧计算](cpu/README.md)

真实浏览器使用 1440×900、Chrome 157，运行于开发机。每房各记录一次接替和一次恢复。修正版四段采样的动画保持期间，模拟时间与实际时间比为 1.001–1.003；整段浏览器回调间隔 p95 约 6.2 毫秒。两次冷恢复过程的最慢回调分别达 328 和 382 毫秒，普通电脑及音频同步仍待实测。房间全景和近景均保留，公司工作室前排隔板会遮住部分走位。[逐段帧耗时、口眼与任务记录](browser-02/report.json)

## 复建与复验

使用原公司交付目录及同层 v1 来源，按[两次独立复建与签名导出命令](../m2-company-vocal-active-v2/rebuild/package-comparison.json)生成 `output/m2-company-vocal-active-v2/rooms`。该目录带独立网页和游戏文件。浏览器从 HTTP 加载模块和资源。

在角色仓库根目录运行下面的单条命令。它会开启一次性本机端口、实际操作页面、保存影片并关闭服务。末项用工程内一个尚未创建的证据目录。

```powershell
node scripts/run-fixed-check.cjs output/m2-company-vocal-active-v2/rooms scripts/qa-game-standing-vocal.cjs 6c3c7b43ae35 evidence/m2-uniform-lite-operator-v1/records.json output/vocal-room-replay-01
```

在同一命令末尾增加 `mic-side` 可复录工作室接替的侧面观察。两版的原始全景仍独立保存。[早期公开接口拒绝](../m2-company-vocal-lineage-intake-v1/cpu/report.json) · [收步修复前的浏览器失败](browser-01/report.json)
