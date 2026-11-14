# DANCE-05 最小共同时间合同（QA 阶段）

当前能力状态以 `docs/CAPABILITIES.md` 的 DANCE-05 为唯一入口。本报告记录纯映射及实际舞蹈时间诊断证据，不另外维护状态副本。此项没有增加产品播放器、音乐库或音轨素材，也没有改 main.js / motion.js。

## 已有时间事实

`motion.getMetrics().dance.time` 暴露实际 `danceClock`。舞蹈混合权重大于 .001 时累计统一模拟 dt，完全退出时清零；新 dance 请求及 setDance 会重置。源循环动作从 `danceClock % clip.duration` 采样，单次动作限制在 clip 末端。因此不能另起浏览器计时器推进音乐，也不能把每次 clip 循环误当歌曲重新开始。`getMetrics().action` 是真实请求动作；退出后旧 clock 可能仍因混合而增长，音轨应停止，不继续把尾部混合当新舞。

## 纯合同与建议的最小集成

`scripts/m1c/dance-audio-mapping.mjs` 是独立 QA 模块，输入完整真实 metrics 与 paused/playbackRate，输出目标音频位置、状态、clip/audio 各自循环次数；它从不推进时间、调度或发声。正 offset 表示音轨相对舞蹈超前，负 offset 表示延迟开始；音轨播放范围 `[loopStart, loopEnd)` 有独立循环周期。offset 与实际 clock 只相加一次，不能再乘 playbackRate，因为该速率已经作用于实际模拟 dt。

`createDanceAudioObserver(config).observe(metrics, controls, actualAudioTime?)` 只读跟踪循环、重启、暂停和可选的真实音轨偏差。没有音频 transport 输入时 `driftSeconds=null, transportObserved=false`，禁止把理想映射自身对比冒称零偏差同步。

后续若集成极小发声验证，建议一个可释放的音频适配实例消费此合同，首次用户手势解锁 AudioContext，仅在开始/暂停/恢复/重启/速率变化时重建或定位音源；不每帧 seek。观测器对比真实音轨时间与实际舞 clock，提供只读 debug snapshot。背景暂停和 resume 仍服从同一模拟暂停策略。一次只验证一个短节拍/一段合法音频，不建立音乐平台。当前没有这层实际适配，也未验证 AudioContext 的 baseLatency、outputLatency、设备输出延迟或听觉同步。

## 已跑与待跑

`node scripts/m1c/qa-dance-audio-contract.mjs` 已通过 5 组边界：正负 offset、clip/audio 独立循环、暂停/0.25 倍速不二次缩放、reset/单次结束/退出、独立实例及循环偏差。全部是纯函数，不能当作游戏或听觉证据。

`scripts/m1c/qa-dance-clock-fixed.cjs` 已在固定 `136da8e156b3` 实际运行：统一命令启动 UAL source loop，观察 1x 跨循环、真实暂停 .35 秒、.25x 恢复、退出及 reset；从当前 motion metrics 读取 actual danceClock。93 条样本中暂停前后均为 1.3048999999761584 秒，恢复 .25x 后读到 1.5336499999761621 秒，检查通过且页面异常为 0。原始报告在 `output/playwright/m1/136da8e156b3/dance-clock-1794694909443/report.json`，精简固定证据在 `evidence/greeting-136da8e156b3/dance-clock-report.json.gz`。

QA 注入仅 observer 函数，不替换产品时间源或骨轨。所有样本没有音轨 transport 输入，故 `transportObserved=false`、`driftSeconds=null`；没有把映射自比等同于音频同步。此固定检查通过不自动适用于后续构建。复跑显式设置 `QA_BUILD` 并用 `run-fixed-check.cjs` 指向对应固定目录；该临时服务器随检查关闭，不修改冻结构建。

后续固定 `0df453d35d2c` 已另行实际复验同一合同，92 条样本通过；暂停前后 actual danceClock 均为 1.3019999999999994 秒，.25x 恢复后为 1.5277499999999995 秒，页面异常 0。原始路径 `output/playwright/m1/0df453d35d2c/dance-clock-1794696683112/report.json`，紧凑证据 `evidence/greeting-0df453d35d2c/dance-clock-report.json.gz`。仍无发声、真实 transport 或设备延迟测量，证据不改标为后续构建。
