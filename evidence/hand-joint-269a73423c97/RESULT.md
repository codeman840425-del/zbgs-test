# 269a73423c97 集成手接触专项结果

本目录对应共享主线集成构建 **269a73423c97**，恢复点提交 aed9597da5fc24c19f232af4f6da62be9d9e61c3。不是 44/08 隔离候选的通过结果转抄。未改产品源码、阈值、检测频率或动作。执行已结束，临时浏览器和服务均关闭。

## 真实几何与功能

| 身体 | joint 新配置：100 姿态交叉帧/事件 | 同版 legacy 旧5轨：交叉帧/事件/最大单帧 |
|---|---:|---:|
| 原 female | 0 / 0 | 15 / 666 / 74 |
| jaw 派生 | 0 / 0 | 15 / 673 / 76 |
| waisthip 派生 | 0 / 0 | 15 / 688 / 86 |

每体使用自身精确 SHA 绑定的手/前臂配置。测量实际变形皮肤 2790 个手、下臂三角与当前显示裙面，30Hz 有限非共面三角边求交及 alpha 样本；所有前臂交叉为0。legacy 非零退出是预期负对照，原缺陷从起身 t=9.1s 开始。它不是连续碰撞、实体包含或最终 GPU 像素的证明，也不涵盖任意手指姿态。

原女性另做 **live 覆盖之后** 的实际皮肤检查：`controller.simulate` 已执行 avatar/live/equipment 后才采样。259 个样本全部0交叉：initial1、sit38、hold30、坐姿招手84、持麦30、卸麦45、rise30、final1。招手是实际公开请求并自然等加载完成。该几何结果不扩展到派生体或男性 live 动作。

其余受影响小验均通过，pageerror 为0：

- 女/男 × 站/坐四例：麦克风真实权重尚未归零时 readiness=false；自然卸载结束才 ready，随后真实招手完成。
- 男短裤材质 recipe 实际两网格应用、切装后保留、源几何/贴图/alpha 语义不变、恢复原材质引用、两个克隆释放；男短裤真实坐起任务完成，未启用女性手配置。
- 两实例使用独立配置及嵌套对象；peer 走路入座实际启用新手分支；彼此根/骨/造型/状态无串写；peer 销毁无残留。
- 坏配置 SHA、HTTP503 均拒绝创建，无半个 peer、主实例不变，自然重试成功。

完整记录见 functional/，每项保留固定构建及身体身份。没有将此前隔离270源姿一致检查重新标作269已测。

## 无录制成本

同机器 Chrome157 / RTX4090，1440×1080、room/authored、**动态关闭**、1×，串行每条件一次短测。帧间隔非 GPU 独立耗时；渲染计时仅 CPU 提交。普通目标电脑尚未测，开发机短测不代表其60FPS达标。

| 阶段 | 旧平均/P95/P99/max ms | 新平均/P95/P99/max ms |
|---|---|---|
| 预热 | 6.062 / 6.3 / 6.7 / 8.9 | 6.574 / 9.7 / 10.6 / 13.4 |
| 站立裙 | 6.067 / 6.3 / 6.7 / 7.7 | 6.067 / 6.2 / 6.5 / 7.9 |
| 坐入 | 6.067 / 6.3 / 6.6 / 7.1 | 6.067 / 6.3 / 6.5 / 6.9 |
| 坐稳 | 8.776 / 10.2 / 13.2 / 18.8 | 9.971 / 12.2 / 13.5 / 15.9 |
| 起身 | 6.388 / 9.6 / 10.2 / 10.9 | 6.387 / 10.3 / 11.1 / 11.7 |
| 回站立 | 6.067 / 6.3 / 6.5 / 6.6 | 6.067 / 6.3 / 6.8 / 9.1 |

坐稳旧399帧、新353帧；P50 为9.2/10.4ms。新平均多 **1.194ms/帧**，不是零开销。旧1帧超过16.667ms，新0帧；两者0帧超过33.333ms。真实平均子步旧1.7995、新1.8329。新总simulate均值9.113ms、hand-fit所有子步7.916ms、最后一个子步4.299ms、render submit0.567ms、轻量采样0.00368ms；hand-fit按每子步左右累计计时最大值计，不把左右重复相加。

开启内部计时的独立新配置短测：坐稳均值9.930ms、P95 11.7ms。每帧真实1.8385子步，内部fit总7.926ms，其中rail/alpha4.797ms、grid0.427ms、skin0.124ms、前臂轮廓0.114ms、joint变换0.0487ms、joint rails0.0116ms、诊断0.0433ms、其它2.359ms。分项是每帧所有真实子步之和，不是单次fit成本。开启计时自身有开销。

## 同镜头正常1×原片

[观看页](index.html)；完整原始 [legacy](video/legacy.webm) 与 [actual](video/actual.webm)。都为269，room相机位置[5.8,4.5,7.8]、目标[0,.65,0]，每帧外参恒定；动态开启，requested playbackRate全部1。只初始定位椅前，之后正常 rAF，不做逐帧推进。不作为入座寻路验收。

| 项目 | legacy | joint actual |
|---|---:|---:|
| 编码末包结束 | 6.205s | 6.200s |
| 编码帧数 | 368 | 358 |
| t>=1s 动作区间 wall / simulated | 5.2112 / 5.2116s | 5.1993 / 5.1988s |
| simulated / wall | 1.000077 | 0.999904 |
| ongoing rAF P50/P95/P99/max ms | 6.1/6.2/12.2/12.2 | 6.1/12.2/12.3/24.2 |
| ongoing >16.667 / >33.333ms | 0 / 0 | 3 / 0 |

首rAF时间戳早于录制初始化，分别为-235.4/-310.3ms；随后236.6/315.5ms间隔保留于原trace，但不是ongoing卡顿。动作窗口从t>=1000ms统计，避免启动错误时钟被算成持续慢放。WebM无Duration header，上述为packet copy读取的最终编码包结束；requested60fps不等同严格恒定60fps。影片canvas为1011×928，浏览器viewport为1440×1080。

原 `video/report.json` 的 status 沿用了 “isolated” QA 标签，保留原件不篡改；initial/final identity 均确证本次269共享集成版。

4fps全时段顺序解码概览在 video/review-legacy/ 和 video/review-actual/，各25帧/3张。工程已看全部25采样帧：两片都完成站立→坐入→坐稳→起身→站立；1.25–2.0s坐入与3.75–4.5s起身未在这组远景采样中看到明显肩肘大幅抬离或动作断裂。但角色仅占远景小区域、手指细节不足，不能据此宣称正常速度自然度/细小悬手通过。两片完整原件保留，**观感仍待用户/技术负责人正常播放验收**；裙硬折与其他服装问题没有因此解决。

## 恢复与重算

49份完整原始证据按manifest.json记录原始/归档双SHA；大JSON gzip level1，完整解压核对，不裁字段。原始33,842,710字节→归档13,425,167字节（后加概览/报告另计）。视频原bytes保留。本RESULT与summary属于新增解释，不改原report。

- `python scripts/summarize-hand-joint-269.py` 从归档重算时钟、成本与阶段；无需浏览器。
- `python scripts/qa-room-filmstrip.py evidence/hand-joint-269a73423c97/video/actual.webm --fps 4 --output evidence/hand-joint-269a73423c97/video/review-actual` 可重建低fps概览。
- 本轮测试脚本和恢复入口保留 qa-sources/ 及 scripts/qa-hand-joint-integration.cjs、scripts/qa-hand-joint-live-stage.cjs；固定构建 experiments/m1-joint-integrated-1/dist 不变。

未覆盖：目标普通PC持续成本；任意手型/新增人体；派生/male最终live几何；全部未改经营功能；未来多人物并行规模。没有把有限80轨当成完整连续胶囊包络，也没有把上述有限真实皮肤0交叉升格为完整视觉通过。

## 补充近景（相同269，无重跑功能门）

保留原room两片，另录 [近景旧轨](video-close/legacy.webm) / [近景joint](video-close/actual.webm)，完整trace与原/压缩双SHA在 video-close/manifest.json。初始相机位置[4.1,1.65,4.38812398365]、目标[2.65,.87,1.28812398365]相同；全程position漂移0，target仅1.11e-16m浮点差异（因此严格JSON比较cameraConstant=false，非实际运镜）。6fps完整37帧概览在各review目录，001末帧3.83s、002前三帧4.0/4.17/4.33s覆盖主要起身。

旧/新末编码包结束6.194/6.208s，371/361编码帧。t>=1s的sim/wall=1.000077/1.000019，未靠dt截断制造慢动作；ongoing P95=6.2/12.2ms、P99=6.2/18.1ms、max12.1/24.2ms，旧0/新11帧>16.667ms，两片0帧>33.333ms。所有pageerror为0。近景样本中，3.83–4.33s手经过大腿/裙腰附近，两片没有明显新增抬肩大动作；坐稳双手仍放在膝上方。采样图不能判断瞬间指尖接触或完整正常速度是否自然，仍须看原片；这不覆盖裙布硬折的修复。首rAF负时间与启动间隔仍按原规则保留并分离。

重算：`python scripts/summarize-hand-joint-269.py --video-dir video-close --summary summary-close.json`。

## 默认动态ON的30秒受影响成本补验

补验只执行 `skirt-sit-hold` 与 `skirt-sit-rise-switches`，不是重复9场景。固定269、1440×900、真实room/UI、full修正、裙装、dynamics=true、无录像、无CPU节流。原嵌套CPU计时算法未改；只给 `qa-m1-current-perf.cjs` 加严格 `QA_PERF_CASES` 筛选，未设置仍为原9项，空/未知/重复项拒绝，Node轻量自测通过。

完整无裁字段报告 gzip、源脚本、双SHA清单与易读summary在 cost-dynamics-on/。两个场景初末固定身份验证通过，pageerror0；均无hidden/paused/background/rate异常、无缺计时帧、无exclusive累计超过scene CPU的帧。

| 指标 | 坐稳 | 坐起切换 |
|---|---:|---:|
| 实测span | 30.158s | 30.101s |
| 帧样本/有效帧间隔 | 2875 / 2874 | 4853 / 4852 |
| rAF P50/P95/P99/max ms | 10.3 / 11.6 / 14.6 / 21.5 | 6.1 / 6.5 / 10.7 / 18.2 |
| >16.667 / >33.34ms | 12 / 0 | 1 / 0 |
| sim/wall | 0.999997 | 1.000000 |
| 平均实际simulate子步/帧 | 2.0042 | 1.0338 |
| scene CPU P95 ms | 11.4 | 5.9 |
| simulate inclusive P95 ms | 10.7 | 5.2 |
| motion P95 ms | 10.1 | 4.9 |
| avatar inclusive / 内嵌VRM P95 ms | .7 / .3 | .4 / .2 |
| garment P95 ms | 0 | .9 |
| CPU render submit P95 ms | 1.0 | .7 |

坐稳全部2875帧处于sit。切换场景含真实寻路/停顿：walk640、idle242、sit2297、stand1674帧，638帧真实速度>.05m/s；不能把总体P95当成纯坐姿成本。动态ON已由sampleStart inspection记录，garment坐稳P95=0是产品计时观测，不是关闭动态。inclusive字段互相嵌套，不可相加；exclusive移除了被仪表覆盖的嵌套调用，但仍不包含GPU完成或浏览器全部合成开销。

本补验是当前新配置真实默认场景的绝对成本，不是与旧版本同条件30秒A/B，不能将前述动态OFF短测差值直接加减到此。仍为RTX4090开发机、每项一次30秒，未验证普通目标PC/持续长时。

复跑命令（需独占窗口，设新输出目录以保留本证据）：

```powershell
$env:QA_M1_BUILD='269a73423c97'
$env:QA_PERF_CASES='skirt-sit-hold,skirt-sit-rise-switches'
$env:QA_PERF_SECONDS='30'
$env:QA_M1_RUN_ROOT='output/playwright/m1/269a73423c97/<fresh-output>'
node scripts/run-fixed-check.cjs experiments/m1-joint-integrated-1/dist scripts/qa-m1-current-perf.cjs
```

本专项所有运行已结束，浏览器/临时服务关闭；没有新的优化或宽范围检查留在后台。
