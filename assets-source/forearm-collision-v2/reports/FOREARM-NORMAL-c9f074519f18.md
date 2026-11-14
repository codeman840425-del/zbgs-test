# c9 正常速坐起 A/B：未通过合入验收

2026-11-14 收尾。固定候选 c9f074519f18、女性身体 027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95。两片相同 1440×1080、close 镜头、椅位、裙装，关闭动态，实际 wall-clock 1×；没有逐帧手动 simulate 或几何探针。lap/authored 均完成站→坐→坐稳→起身→站，0 pageerror。仅变 handTarget 查询参数；均为 80 rails 候选，不是原版旧 rails 性能基线。

## 可看文件与观察范围

`../media/c9-lap.webm`、`../media/c9-authored.webm` 是原始连续录屏，不是抽帧拼接。请求 captureStream 60fps，实际编码分别 282/280 帧，末 PTS 6.226/6.268 秒，不能标作稳定60fps。

本代理实际检查了全程4fps顺序解码图，以及坐下1.35–1.90秒、起身3.80–4.35秒20fps顺序解码图。**这是采样序列审看，不等于人观看完整正常速视频，也不能完成最终自然度验收。** 图见 `../screenshots/normal-*`；完整原始rAF日志仍在 `output/playwright/forearm-c9f074519f18/normal-video`，身份和hash已归档。

- lap 坐下约1.50–1.65秒，手臂先近伸直再突然外折；实际 rAF 1.657秒左肘141.22mm、1.699秒右肘143.32mm位移，而原源肘位移38.51/41.38mm。起身4.187秒仍有左肘96.07mm位移（rAF仅6ms、原源10.14mm），不能归咎于卡帧。
- authored 同区间保留弯肘逐步落手，抽帧中没有lap同样的近伸直后大幅外折。最大实际rAF肘位移43.59mm出现在起身3.865秒，间隔48.5ms，原源38.83mm；不再是旧137mm校正分支跳。仍不能据此称正常速观感已通过。
- 起身与坐稳裙子仍呈既有硬折。本任务没改裙拓扑/solver，不能把手臂改善写成裙装已修。
- 全270步几何检查的固定腰环、手腿结果仍见先前报告；本轮正常速录屏没有逐帧几何复验，不能将该零交叉移植成整片无穿插结论。

## 首帧与持续帧耗时必须分开

两次最大 rAF 间隔345.9/321.6ms都发生在录制首段，前一rAF timestamp相对 recorder.start为−339.3/−315.2ms，下一样本为+6.6/+6.4ms。这涉及同一刷新周期timestamp早于录制开始，不是已经持续播放中卡320ms的证据。保留原始数据，不删除后宣称整体达标。

按首次坐稳至stand请求划分（含末端浮点进度轻微偏离1的样本），持续成本如下：

| 模式 | 坐稳区间 | rAF平均 / P95 / 最大 | >33.334ms | 最后子步fit平均 / P95 |
|---|---|---|---|---|
| lap | 2.276–3.732s | 27.93 / 36.50 / 42.50ms | 5/53 | 5.71 / 6.20ms |
| authored | 2.293–3.774s | 44.96 / 48.60 / 48.60ms | 34/34 | 6.71 / 8.00ms |

持续坐稳约45ms是实际风险，不能用先前固定步进fit均值5.27ms掩盖。authored全片P95为42.5ms；同片坐下、起身最大48.4/48.5ms。观察结果未达到60fps，更不是普通电脑目标设备通过。

代码事实：该固定候选每帧采用 `ceil(min(elapsed,50ms)*120)` 个simulate子步。calibrated关闭旧腕偏移cache，坐稳每子步仍采衣物/建grid/求解80rails。45ms通常对应约6次子步，末步fit约6.7ms，具有成本叠加的明确嫌疑；**本轮没有记录实际每帧step数或总fit，不能把这段估算当实测归因。** `fitElapsedMs`是从整fit入口开始累计到当前臂，取最后/最大值，不能左右相加。

录制器和诊断 observer 也有成本：每rAF调用snapshot、保留两臂逐轮trace；MediaRecorder编码异步。现有日志没有记录observer、encoder、render或每子步分项耗时。两片只各一次，顺序lap→authored，也不能证明性能差完全由目标策略引起。初始站立穿裙确实仍计算fit（末步均值约3.8ms）；这与无裙站立/行走提前返回不同，不应混淆。

## 暂停与复工入口

当前候选不合主，源码补丁仍隔离。男性没有seatHandRadii，未执行该层；80rails不是完美包络。稳定坐姿可考虑复用拓扑/缓冲，但几何随源姿态和cloth变化，未经验证不缓存实际面位置。本轮没有实施新优化。

复工先由root授权窗口，使用已保存worktree固定dist，不重录本片、不改主运行时。下一最小检查应为相同场景/身份/镜头的不录屏短测，记录真实simulate调用数、总耗时、末步fit、轻量observer成本，再决定是否需record on/off对照；不能先归因encoder或改碰撞范围降低成本。**该短测尚未创建/运行，用户已要求暂停。**

现有离线复算命令：

```powershell
python assets-source/forearm-collision-v2/scripts/analyze-normal-video.py output/playwright/forearm-c9f074519f18/normal-video
```

当前浏览器和临时server均已关闭；本次收尾只读取旧视频、生成报告、归档，不重新启动browser/Blender。
