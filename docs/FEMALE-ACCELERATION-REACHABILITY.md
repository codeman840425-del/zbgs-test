# 女性走→跑支撑延长：真实链可达性调查

状态：已用真实资产/运动工厂复现符合实际控制器加速率的失败；房间controller测试脚本已准备，**尚未运行，不能称已证实房间复现或不可达**。本轮未改main/motion，不重复270转身矩阵、不启动浏览器。

## 已确认的条件差异与新复现

旧 `qa-gait-phase-sweep-node.mjs` 合成加速/减速均2.5m/s²，女性起始walkPhase≈.05的89mm支撑失败不是精确真实控制律。`main.js`实际普通路径加速1.5、减速2.5；desired受目标剩距、转角cos³、近拐角减速约束。无障碍直线、距终点充分远时，desired=maxSpeed，速度按1.5加速，实际位移/帧时间传给motion。motion在speed≥1.85进入跑步，.30秒混合；源phase按实际移动距离推进。

先按1.5加速在.05/.15…/.95十相位采样，最大支撑2.21mm；**该稀疏结果不代表安全**。进一步按实际换档前源phase反推窄区间：

|发出加速时目标walkPhase|Node实际接触误差峰值|
|---|---:|
|.74|1.81 mm|
|.76|94.21 mm|
|.77|89.59 mm|
|.78|100.59 mm|
|.79|114.56 mm|
|.80|1.90 mm|

证据：`evidence/female-acceleration-controller-law.json`（十相位）、`female-acceleration-narrow.json`（12窄相位完整帧）、`female-acceleration-reachability-summary.json`（紧凑峰值及源码SHA）。运行脚本 `scripts/qa-female-acceleration-node.mjs`，实际当前motion SHA `7d75fd3bfe4725b5178b1419eaf75fa6fa550c4f3a81a26b0b8620734752b1a2`。

## .78示例的因果链

实际初始phase .778938、速度.85。加速0.666667秒后速度1.8625达到跑步门槛：原walkPhase .479778，最近双脚pose匹配把jog选.291667；本帧后runMix .027778。此时左toe支撑、右脚近地但未支撑。再一帧（t=.675）右heel低到1.646mm，混合轨迹捕获新heel锚点；后转为toe，持续到t≈1.166667。t=1.158333已经runMix1、速度2.55、jogPhase .759633，右toe仍支撑，target/actual相差100.59mm且reachClamp=true。即不能只预判切换瞬间**已经**植地的脚：混合开始后马上捕获的另一脚也可能把下一跑步支撑周期接长。

当前male修补仅对充分混入跑步的退出预测已有植足。walk→run仍是瞬时两脚姿态匹配，所以它没有覆盖此新捕获的未来支撑链。可考虑的局部修复边界是：相位候选评估跨fade的预期落脚/离地事件，以及新落地后按实际速度累计的可达行程；保留当前锚点与淡化连续性。不能只扩大髋下沉/横移cap、挪支撑anchor或缩小动作掩盖。现在只提出修复范围，未实施或宣称有效。

## 准备的实际房间输入

`qa-female-acceleration-room.cjs`已 `node --check`。沿用已有真实鞋底/支撑/帧跳门槛，不放宽：

1. 固定候选女性基础人体，站稳后实际request走至(-3.2,1.8)，完成后步入到(3.2,1.8)的直线。
2. 用正常setSpeed .85维持步行，等实际moving、速度.84–.86、剩距>3m和phase窗口±.006；只读phase，不写phase或root。
3. 在.05及.70–.82共14个指定相位触发正常 `setSpeed(2.55)`，捕获1.5秒完整混合与支撑；再实际request idle并收步。
4. 捕获真实raw脚/蒙皮鞋底、anchor、reachClamp、gaitTransition、runMix、请求与剩距。若窗口没到明确 `fixture-not-reached`，不能将其当作通过或不可达。
5. 固定构建初末核SHA。准备命令（**未执行**）：

```powershell
node scripts/run-fixed-check.cjs <efdf558930a4固定dist目录> scripts/qa-female-acceleration-room.cjs efdf558930a4
```

这是普通路径/速度接口触发的相位条件测试，numeric simulate120Hz不是正常速视频；真实控制器是否在这段有限房间与源初始历史下到达同失败状态仍待授权浏览器窗口。若达到，应保留负例、最短输入和完整帧再修；若本组未达到，也只缩小已测范围，不能推断所有房间路径无故障。

## 真实房间负例已证实（efdf558930a4）

浏览器实际执行已完成并关闭，固定dist `experiments/turn-candidate-17/dist`。输入只用正常走路request与setSpeed2.55，读取phase触发，不直接写phase/root/bone。四个失败窗口的支撑峰值：.76=95.902mm、.77=91.286mm、.78=96.256mm、.79=114.184mm；对应连续支撑点水平漂移约69–87mm。原始完整捕获 `output/playwright/m1/efdf558930a4/female-acceleration-phase-1794699168026`，紧凑回执 `evidence/female-acceleration-room-negative.json`。

原report内`negativeReproduced:false`沿用了ca72专用开关定义，并非这个故障没复现；新回执显式记`actualRoomFailureReproduced:true`。其它几个phase另有>100ms clamp，必须区分停止/摆腿/支撑，不可以仅因支撑误差小就覆盖原门槛失败。本轮所有失败保留。

## 隔离候选，不是主线通过

`analysis/female-acceleration-fix/motion-pose-trajectory.js` SHA `2413410e856e6122eb6ff0ae01aa10d7968a568bd21ac87c01e10a88f64027d3`；小补丁 `evidence/female-acceleration-fix/pose-trajectory.patch`。只改walk→run的phase评分与telemetry，不改锁脚、腿长、髋修正或路径。

瞬时两足position可能接近，但位于步态不同方向/阶段。候选用120份已校准source轨迹中央差分得到两脚局部速度，按各clip实际stride和当前speed换算；原位置误差加入**现有.30秒淡化时窗**的一阶轨迹误差平均积分：

`mean |dPosition + t*dVelocity|² = |dPosition|² + T*dPosition·dVelocity + T²/3*|dVelocity|²`，T=.30s，XYZ权重仍1/.5/1。

这不是调一个支撑解锁门槛，也不假设每个近似预测点就是精确混合骨姿。它把目标脚的运动方向/速度也纳入相位选择，避免马上捕获的脚刚好跨接另一个支撑周期。仅在runMix<.05进入跑步时启用，旧已验证run退出行程评分不变；后续真实场景/过渡自然度仍须验证。

一个先试的“端点位置线性混合＋新落地预测”未能修复：预测超限3–7mm，真实89–114mm，因为骨骼旋转混合不等于端点线性插值。保留在analysis的motion-candidate.js/candidate.json，不合入。只加半窗速度差平方也仍有32.16mm失败，保留motion-velocity.js/velocity.json，不用它通过验收。

最终隔离候选数值：22实际控制加速率phase最高支撑2.210mm，原F/M32相位最高4.583mm（包括旧合成89mm窗口），male±90退出复算最高4.965mm、支撑clamp0。原30mm支撑、15mm接触单帧、60mm脚/target单帧、100ms支撑clamp、地面−6mm门槛未放宽。`node scripts/check-female-acceleration-patch.mjs`检查精确源SHA与上述报告已过，紧凑结果在evidence/female-acceleration-fix。

**下一项必要验收：**Root review补丁后新固定构建，首先跑同14个真实房间加速phase，检查原四个失败消除且其它门槛没有回归；再复核旧airborne降档/male退出与正常速画面。候选尚未浏览器执行、未主线替换或视觉通过，不得将此离线结果直接提升观看入口。

## 合入前独立源审查与后续定点验收

2026-11-15复工审查：`scripts/qa-gait-phase-source-review.mjs`运行5项通过，报告 `evidence/female-acceleration-source-review.json`。实际提取的gaitSample函数返回hip/ankle/heel/toe均clone；对负phase、0、1和跨周期采样的返回向量进行sub/set/multiply未污染校准缓存。中央差分的单位为m/cycle，乘speed/stride得到m/s，T=.30秒积分结果为m²，与原位置评分单位一致；带负cross项的总成本数值积分核对非负。`trajectoryCost`自身可以为负，不能误当错误；`poseError`仍只报告瞬时位置误差。candidate除matchGaitPhase外全部字节与baseline相同，支撑阈值、更新状态、anchor/髋限值未变。源审查支持合入**独立待测候选**，不支持直接宣布游戏修复通过。

受影响边界：仅kind=jog且runMix<.05的进入；.05本身及未完成淡化时反复切换仍保留原匹配，尚无全面覆盖。源速度为局部一阶近似，未精确模拟旋转骨姿、急转和加速度全时窗。Root已确认合入主motion与候选精确同SHA241341…，此记录不代表已生成/验证新固定dist。

负例超时分类另存 `evidence/female-acceleration-negative-clamp-classification.json`，可用 `node scripts/classify-acceleration-clamp.cjs <female-base.json> <输出.json>`复算：

- .76–.79：右脚真实support clamp58–67ms，随后swing/unplanted92ms。原all-clamp150–158ms门槛失败仍保留。
- .05：停止后的idle/unplanted右脚clamp308ms、raw-target峰值74mm；.80–.82同阶段283ms、约52mm。非支撑不等于无害，不放宽原100ms门槛；需新候选验证并按接触阶段查因。

新fixed的准备验收（等浏览器协调，不先运行）：

1. 原 `qa-female-acceleration-room.cjs`14相位整段，包含明确stop阶段，所有原门槛不变。
2. 受影响旧降档：`qa-locomotion-transitions.cjs --cases=female-base,male-base --replay-only`，含真实走跑退出和已知airborne .278窗口；必要时使用同脚本原四相位，不重跑270全矩阵。
3. 男原退出定点：`qa-turn-contact-chain.cjs --body=male --fps=30 --angles=90 --modes=run --no-extras`，随后 `qa-turn-regression.cjs <输出目录>`。
4. 保留初末build/body/hash及switch帧耗时。数值通过后正常速近景检查加速/落脚/收步，仍不以代码或离线结果替代视觉验收。

## 392e6f89183d实际候选回归与停止阻塞

固定候选 `experiments/turn-candidate-18/dist`实际浏览器已跑：原14相位13/14全gate通过，原四个91–114mm支撑错误消除，整链支撑峰值2.734mm。尚余.05停止阶段右脚非支撑reachClamp275ms、raw-target49.76mm，**整体gate仍失败**。记录 `output/playwright/m1/392e6f89183d/female-acceleration-phase-1794699992955`；单项补充hip/腿长/stopTime捕获 `.../female-acceleration-phase-1794700104326`。

旧降档定点 `.../locomotion-transitions-1794700032275`：男女airborne .278通过、男性混合traverse通过；女性旧ca72混合traverse在idle非支撑右脚仍clamp133ms/4.12mm，所以整批不通过。male run±90另经完整接触gate通过：`.../turn-contact-chain-1794700070067/contact-regression.json`。本轮全部浏览器及临时server已退出，没录受影响正常速片，不将其计为通过。

### 共同停止根因（已定位，不靠降低门槛）

两项停止前最后一帧均**左右foot.contact=false**。stop初始化按Number(contact)稳定排序，仍任意给左脚order0、右脚order1。右脚lastActual固定等待.24秒，髋已经从跑步/行走姿态抬到idle；gathering的reach保护仅照顾contact脚，所以两脚非支撑时完全没有保护。

.05真帧：t9.125 stopTime.0083，右hip→target距离.726969m可达；t9.350 stopTime.2333，target仍固定在[.984008,.126169,1.848160]，上腿原点[.632882,.864424,1.873257]，距离.817888m，右腿长.352829+.415313=.768142m，恰好约49.76mm超出；adaptiveHipDrop≈2.6e−9。root此时没有移动。这是无支撑时仍强制等待另一脚的调度错误，不是需要再加髋下沉cap。

### 最小隔离停止修补

`evidence/stop-gather-fix/stop-gather.patch`：stop入口记录`hadSupport=feet.some(contact)`；只有存在真实支撑脚时保留原顺序；双脚都无支撑时两脚各自从lastActual立刻平滑收回，stopOrder均0。保持原.24秒轨迹、抬脚、结束姿态、所有anchor/IK/cap/阈值不变。有支撑脚时仍先自由脚、后支撑脚；双支撑仍原先后。

隔离候选SHA `c9a3208e0fe4be62b6cb18097d404be1f9afdf0babb337a5e3d9a6ca1d9eeea0`，主线未由audit改动。`scripts/qa-stop-gather-node.mjs`真实工厂F/M×四相位共8例（停止也统计ALL clamp）与 `check-stop-gather-patch.mjs`已执行；F.05复现275ms→0，最大踝步进不增加，8例均在原门槛内。源/结果摘要 `evidence/stop-gather-fix/`。这不是候选实际浏览器或自然度验收，下一固定版仍需原14+旧两性退出复验、正常速停止观感和有/无支撑的停止检查。

## 34148e260e6d固定房间复验

Root已合入上述两项修补，固定源SHA为 `c9a3208e0fe4be62b6cb18097d404be1f9afdf0babb337a5e3d9a6ca1d9eeea0`。本轮限定原14女性基础体相位及女性旧ca72/airborne退出，全部通过原门槛，未扩大为所有身体/服装/方向组合均通过。此前392版失败结论保留为历史。

- 原14项：支撑误差最大2.734mm，连续ALL reachClamp最大50ms，目标/真实踝单帧最大48.354mm，脚底最低−1.041mm；原.05停止的275ms连续clamp消除至0。
- 女性ca72命令重放：支撑最大2.305mm，连续clamp为0；airborne .278退出支撑最大2.734mm，连续clamp为0。两项无门槛失败。
- 浏览器页面错误0，初末build/身体身份核对保留于原报告；Chrome与临时服务器正常关闭。

紧凑回执 `evidence/female-acceleration-fixed341-receipt.json` 保存精确源SHA、原报告SHA、门槛、逐项最大值与失败列表。原报告分别位于 `output/playwright/m1/34148e260e6d/female-acceleration-phase-1794700518813/`、`.../locomotion-transitions-1794700555444/`。新clamp分类在 `evidence/female-acceleration-fixed341-{clamp,exit-clamp}.json`，没有把非支撑clamp从验收中删去。

这是实际房间控制链120Hz数值推进，不是正常墙钟速度录像，也不是性能测试。受影响加速→停止的同镜头正常速前后对照仍待录/审；数值通过不代表自然度通过。

### 新检出恢复

精确历史源码与manifest已收敛到 `evidence/motion-source-snapshots/`，小型报告和male输入轨迹也已归档。两项receipt脚本不再读取忽略的analysis目录；在无analysis/output/prototype/node_modules的临时输入树实际执行均通过，记录 `evidence/gait-receipt-portability.json`。这不是声称执行过全新Git clone或几何重跑。恢复命令、需要的运行依赖与结果范围见该目录README；旧报告中的原analysis位置保持原样，不改历史hash。

## 正常速度前后录像（已收片，视觉仅抽帧筛查）

`scripts/qa-acceleration-normal-record.cjs`复用既有正常rAF录像流程，未调用simulate/advance，未写相位或骨姿。female base同房间固定镜头，先完整右→左行走5周期，再左→右；稳定.85m/s且真实phase在.76–.79时请求2.55m/s，行进2.8m后请求idle。两次自然相位有微小差异，已保留真实值。

| 版本 | 触发相位 | 加速/停止视频约秒 | 加速段支撑metric峰值 | 完整片 |
| --- | --- | --- | --- | --- |
| efdf旧版 | .762907 | 12.010 / 13.485 | 右脚90.487mm，13.179s | 15.039s，903帧 |
| 341修补版 | .762775 | 12.017 / 13.491 | 左脚2.013mm，12.487s | 15.038s，903帧 |

两片初末build/body身份、1×、相机/外观帧gate均通过，页面错误0。旧片13.142–13.179s真实运行contact=true且metric超30mm；峰值raw踝与target距离也为90.487mm，因此不是只重述120Hz数值负例。但此录像没逐帧重新测所有蒙皮鞋底，不等于完整几何gate。

视频分别在 `output/playwright/m1/efdf558930a4/acceleration-normal-1794700818153/`、`output/playwright/m1/34148e260e6d/acceleration-normal-1794700855383/`，文件均为`female-base-walk-acceleration-stop.webm`。各目录保存原始trace、report、全帧解码摘要、每.25s全时序图、诊断裁切图与visual-review.json。紧凑索引/视频hash汇总为 `evidence/female-acceleration-normal-comparison.json`。

已检查两片各61个覆盖全时序的抽帧：旧片约13.25s可见较长的后伸腿，新片对应后腿更明显屈膝；两片都收回idle。正常走路/转身段未在采样图中看到肢体分离。停止13.5–13.8s的收步顺序明显不同，**不据此宣称连续自然度已通过**；短暂跳变、滑步与重心节奏仍需连续播放审看/用户判断。本轮female base结果不继承至裤裙或男性。

## 用户限定片段验收（2026-11-14）

用户观看上述同镜头1×对照后，对 **34148e260e6d约12–15秒加速与停止** 回复“这段可以接受”。该片段记为用户接受；不扩展到其他转向片段、裤裙、男性、175集成候选或整体M1。原工程抽帧记录保留，未声称工程人员已连续观看全部录像。精确视频SHA及范围见 `evidence/female-acceleration-user-review-341.json`。
