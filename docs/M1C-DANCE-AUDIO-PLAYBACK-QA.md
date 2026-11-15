# 隔离短节拍播放小验：准备记录

本项复用 `dance-audio-mapping.mjs` 与既有共同时间合同，不改 main、motion、CAPABILITIES 或 CURRENT。代码在 `scripts/m1c/`，音频源在 `assets-source/m1c-audio-qa/`；未放入产品运行时或公共资源目录。已在固定 `efdf558930a4` 实际运行初版与一次启动门修正复验；音频图实际输出通过，首次启动偏差得到改善，但**扬声器听觉同步仍未验证**。详见下方实际结果。

## 范围与时间来源

`dance-audio-harness.html` 同源 iframe 打开负责人指定的固定房间，读取真实 `__debug.motion().getMetrics().dance.time`，通过统一命令开始/退出舞蹈。明确点击“启用短节拍”才创建并 resume AudioContext。不得以本地理想时钟替代舞蹈时间。

`dance-audio-transport.mjs` 使用一个原生 AudioBufferSource 循环播放 2 秒 PCM。开始、暂停恢复、倍速、offset、重启、退出触发重建/停止；普通帧、源动作循环和音频自身循环不重启，也不每帧 seek 追齐。因此漂移会被记录而非被隐藏。音频 playbackRate 收到真实模拟倍率，已累计的 danceClock 不再次乘倍率。

播放位置由 source 启动 offset、独立 `AudioContext.currentTime` 和本次 source 速率推算，并显式命名 `estimatedBufferPosition`。这不是设备播放头读数。既有 observer 收到这条独立音频时钟估计，用来计算相对实际舞蹈时钟的漂移；不拿目标位置回灌自比宣称零漂移。

另外记录实际音频图 Analyser RMS、MediaRecorder 内部输出、context state/currentTime、getOutputTimestamp、baseLatency/outputLatency。后两项及 timestamp 是浏览器报告的估计，不是测得的扬声器到耳朵、画面到眼睛延迟。内部图录音只能证明音频图产生信号；不能取代人耳试听或硬件回采。

## 原创可重复音源

`node scripts/m1c/generate-beat-pcm.mjs` 输出 48 kHz 单声道 PCM16、120 BPM、2 秒四击节拍（首击 880 Hz，后三击 440 Hz），没有外部采样/音乐许可依赖，源与输出声明 CC0-1.0。WAV 192044 字节，SHA256 `601fe6230db9975ec665c01961789f3b5b80a831ab6adbec63293a4c3fde85dd`。生成峰值 .3、播放器 gain .35；系统音量仍由用户控制。这是时间提示音，不宣称动作本身按 120 BPM 编舞。

## 已完成离线检查

- 既有纯合同 5 组继续通过，未改写合同。
- `qa-dance-audio-transport.mjs` 6 组通过：独立时钟故意偏差会报告；跨两个循环不重启；暂停/四分之一速恢复；正负 offset/reset；退出/context suspend/dispose/实例隔离；PCM 可重复并有真实点击与静音区。
- `qa-dance-audio-playback-fixed.cjs --check` 校验 PCM 哈希及计划，脚本语法检查通过。以上全部无浏览器、无声音，模拟 context 的测试不能当作 WebAudio 实际通过。

## 待分配窗口后的唯一入口

PowerShell 示例（负责人给具体构建和目录后替换）：

```powershell
$env:QA_BUILD = '<12位固定构建ID>'
node scripts/run-fixed-check.cjs '<固定dist目录>' scripts/m1c/qa-dance-audio-playback-fixed.cjs
```

脚本只通过 Playwright route 暴露隔离 QA 文件，固定 dist 不改。显式 headed Chrome 移除默认 mute-audio，真实点击解锁；先验证固定 runtime/served build 与当前女性 VRM SHA。实际约 6 秒播放链：1x 跨循环→暂停 .4 秒→.25x→+.4 offset→reset/−.25 延迟→退出，最后释放 AudioContext/音频轨/浏览器/临时服务。预留约 20–40 秒含载入与取证，不与性能录制共享窗口。

输出是原视口视频、独立内部音频 WebM、room 截图及逐帧 report。Playwright 视频默认没有声音；音频与视频分别保存，**不能称为已同步的最终音画录屏**。report 保留所有失败、真实 RMS/时钟/生命周期；listen 字段待人耳观察。目标设备延迟、硬件回采、听觉同步和舞步踩拍仍属未测，最终可用状态由负责人依据实际运行更新唯一能力清单。

## 固定 efdf558930a4 实际结果

使用 `experiments/turn-candidate-17/dist`，浏览器 headed、显式点击解锁、连接系统 destination。两次各 925 条真实样本，runtime/served build 与当前女性资产哈希均验真；两次结束均释放 AudioContext、音频轨、Chrome 及临时服务器，没有后台播放器。产品构建未改；两个 run 的差别仅在隔离 QA 启动门。

初版 `dance-audio-playback-1794699249237` 保留实际失败：虽然 context.state 已为 running，currentTime 在 22 条样本、127.4 ms 观察跨度中仍为 0，而真实舞蹈时钟已推进。首段源位置估计落后最大 **122.7 ms**、中位 **113.27 ms**。生命周期布尔检查通过不能覆盖该同步缺陷，不能只展示 `exitCode=0`。后续重建 source 的三段误差最大绝对值为 2.56/6.50/5.87 ms，提示主要差别在首次设备时钟启动；这不等同硬件延迟已校准。

负责人授权后，只在 QA transport/harness 加启动门：仍须真实用户 activation，先接无声 source，等待实际 context 时钟累计推进 ≥40 ms 且至少 3 次观察到增加，再允许发舞蹈 start。支持 3 秒超时并释放探测 source；没有每帧 seek 或修改角色时间。新离线停钟/超时检查通过，Node transport 总计 7 组。

唯一复验 `dance-audio-playback-1794699384095`：启动门等了 **167.3 ms wall time**，音频时钟从 0 到 .04 秒，三次推进后再开始舞蹈，正式播放不再出现零音频时钟样本。各 source 段独立时钟估计漂移如下；不包含设备声学延迟。

| 段落 | 样本 | 漂移最小 / 中位 / 最大 |
| --- | ---: | --- |
| 首段 1x | 373 | 0 / +7.53 / +13.33 ms |
| .25x 恢复 | 135 | −0.24 / +1.07 / +2.38 ms |
| +.4 秒 offset，1x | 110 | −9.13 / −2.63 / +2.67 ms |
| −.25 秒延迟后，1x | 108 | −6.90 / −1.27 / +4.60 ms |

真实 Analyser 最大 RMS .024948；内部 Opus 录音解码 270720 样本/48 kHz/5.64 秒，峰值 .088763，确有非零节拍和静音区。循环首段出现 .05/.55/1.05/1.55/2.05 秒的内部录音点击（10 ms RMS 分箱），音频循环与源动作循环没有重启 source。真实暂停停止 source；恢复 .25x、正负偏移、reset、退出停止均通过，页面异常 0。

短暂 .25x 段落在节拍静音间隙内结束，没有容纳完整慢放节拍周期；该段证明实际 AudioBufferSource 恢复与时钟倍率，**不声称已通过慢放节拍的听觉节奏验收**。暂停/退出静音由真实图采样另行记录。浏览器报告 baseLatency=10 ms，outputLatency=40 ms；这是设备路径估计，与表中估计漂移是不同量，不能简单相减得到听觉同步。getOutputTimestamp 原值保留，未当声学校准用。

两部录像分别完整解码 239/246 帧、9.52/9.8 秒，并查看覆盖整段的各两张 .5 秒联系表：场景动作、暂停及退出可见，未因 QA 层改变人物控制器。录像无音轨；内部音频无扬声器采集，未伪造合并“同步视频”。本轮无需再为数值绝对归零反复追时。

原始目录：`output/playwright/m1/efdf558930a4/` 下上述两次 run。紧凑档案 `evidence/dance-audio-efdf558930a4/` 保存 before/after 原片、内部录音、原 report gzip、离线解码摘要、图及哈希；失败不覆盖。第二次 report 有精确 QA module SHA，和相同固定产品 build 身份分开记录。下一项若获授权，是更长实际慢放节拍与人耳/输出回采观察，不将此隔离小验包装成产品音乐播放器完成。
