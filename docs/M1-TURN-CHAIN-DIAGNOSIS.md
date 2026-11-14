# 0df固定转向链诊断

这是2026-11-14的有界数值诊断，不替代正常速度视觉或当前能力清单。真实房间固定版为`0df63cf2bdea`；脚本为`qa-turn-chain.cjs`。本轮只跑60Hz模拟外层帧率、内部仍按生产规则拆成120Hz子步；没有把它称为60FPS设备性能。

实际范围：女性完整基础体，idle/walk/run各自向左右1/15/45/90/180°路径、行走/跑步中反向再重选、0/60°两椅接近对齐，共36场景。跑步准备要求实际speed>2.1、runMix>.99，不能把速度设置值当已经跑起来。

## 实际调用链：已排除与已发现

- 左右1/15°在idle/walk/run都不调用planner：reset、requestHeading均0。实际走路径的朝向处理先执行。站立发起时朝向反馈8.33ms，首次平移超过5mm约83.3ms。不能拿pure小角度转向的固定步型解释这条实际路径。
- 单一45/90/180°路径的planner reset均只有1次。requestHeading分别44/65/130次，其中43/64/129次是相邻同heading重复提交；调用前后step/progress/yaw没有重启。因此当前证据**不支持“每帧相同heading导致重复reset”**。
- 真跑步发起45°变向时，下一120Hz步实际速度立即变为0；planner active约.358秒，首次向新路径平移约.450秒。180°同样立即归零，active约1.075秒，首次平移约1.167秒。它证明真实路径存在突变制动，不是只看源码猜测。
- 反向中再次重选的场景reset1次、两个不同heading；前一请求被取消，最终路径完成。
- 60°椅路线的4次reset发生在仿真t≈.008/3.950/5.558/6.583秒，调用前planner均inactive；目标heading依次约1.5508/2.3562/−2.01236/1.04720弧度。它们对应真实路径角点和最终椅朝向，不能把总次数4直接解释为同一目标被反复重启。0°椅路线是2次reset/2个不同heading。

每次包装器只记录原planner方法的参数、前后sample和调用计数，原方法原参数继续执行；没有覆盖姿势或替换planner。记录包括mode、actual/controller speed、walk/jog phase、turn phase、contact、stopTime、raw足世界位置和四元数、任务ID及最终状态。

## 测试器边界与修正

首次36场景报告整体FAIL仅来自两椅测试器停止过早：`transitionComplete`在sitProgress>.995即为true，而实际sit任务等sitProgress===1。脚本据前者停止采样，再检查task completed就误报。原报告保留为`actual-path-summary-initial.json`；这不是已确认的产品椅失败。

已把QA条件改为sitProgress===1且对应task completed，并增加`--chairs-only`仅复测两例；未借此放宽产品完成条件或修改runtime。修正后的运行结果须另保存，不能覆盖首次报告。其他34条路径/重选已完成；没有因两椅QA误报而重复所有已测场景。

随后仅两椅的0df固定补测已通过：0°椅6.167秒、60°椅8.950秒，两者真实sitProgress===1、sit任务completed、无页面错误。调用计数仍分别2/4次reset，对应2/4个不同heading。新证据为`evidence/turn-chain-0df63cf2bdea/chair-qa-corrected-summary.json`，原始输出`turn-chain-1794691565326`；首次QA误报保留，没有覆盖。

## Pure planner：独立证据

另从已提交`1727d1309fcb509a09fb586fac6e4bf7dd1ea268:prototype/src/turn-policy.js`取得只读快照，避免负责人正在修改工作源码污染基线。`qa-turn-policy-observability.mjs`对左右1/5/15/45/90/180°、30/60/120Hz共36例，重复提交相同heading；幂等、到达和调度层支撑足朝向检查通过。

60Hz下1/5/15°均约.35秒，来自固定turn步长与gather时长；45°约.367秒，90°约.550秒，180°约1.083秒。这是纯调度时间，既没有身体/IK也没有路径。小角度纯planner成功不说明实际角色踏步自然，也不能将pure结果冒充0df浏览器对应小角度路径。

证据在`evidence/turn-chain-0df63cf2bdea/`，包含实际调用摘要、触发片段、原始固定身份回执和pure来源SHA。完整实际逐子步轨迹保留于`output/playwright/m1/0df63cf2bdea/turn-chain-1794691053800/fps-60.json`。

```powershell
node scripts/run-fixed-check.cjs experiments/m1-0df63cf2bdea/dist scripts/qa-turn-chain.cjs 0df63cf2bdea --fps=60 --angles=1,15,45,90,180 --modes=idle,walk,run
# 只复核修正后的椅终止条件
node scripts/run-fixed-check.cjs experiments/m1-0df63cf2bdea/dist scripts/qa-turn-chain.cjs 0df63cf2bdea --fps=60 --chairs-only
```

尚未实跑当前真实房间30/120Hz矩阵、男性本组转向或新转向候选；不因脚本支持这些参数就宣称已测。脚本中的支撑脚世界变化目前用于定位，不单凭一个非零量认定新的产品错误。

## 新候选的必要矩阵与正常速度入口（仅准备）

先固定候选再运行，避免工作区改动/HMR污染。最小顺序：

1. 女性基础60Hz：左右1/5/15°、45/90/180°，idle/walk/run，加反向中重选、明确急停和椅对齐；记录真实是否调用planner，不能将pure结果套给小路径转向。`qa-turn-chain.cjs`现有extras覆盖重选/椅，明确急停的完整正常链由下面录制器覆盖。
2. 首例无新的逻辑/接触失败，再对男女基础各跑30/120Hz代表1/15/90/180°及重选/椅。三外层帧率仍保留生产120Hz子步，不伪装目标设备帧率实测。男女脚长/坐姿差异不能继承另一身体通过。
3. 正常1×录像至少覆盖男女裤装的45/180°走跑换向、重选/急停、60°椅；女性裙/新短裤作为实际装备组合另验接触和画面。衣片新接入不得沿用基础模式视觉结论。小1/5/15°另录站立发起与正在行走片段，检查是否有不必要大抬腿或转体停顿。

新脚本 `scripts/qa-turn-normal-record.cjs` 使用真实rAF/墙钟，无`simulate`或`advance`。固定同房间镜头、1×、viewport、body/outfit；按实际runMix与速度进入跑步条件。每段独立WebM、逐帧状态、任务事件、longtask与最大墙钟间隔保留，遇中断保存未完成片。录制完成只记collectionComplete，视觉仍需整段观看。默认只录左右45/180°真跑步，不自动跑大矩阵。

```powershell
# 查看计划，不启动浏览器
node scripts/qa-turn-normal-record.cjs --plan
# 新固定版本可与0df使用同一参数分别录制；此处尚未执行
node scripts/run-fixed-check.cjs experiments/m1-<BUILD>/dist scripts/qa-turn-normal-record.cjs <BUILD> --body=female --body-mode=dressed --outfit=0 --modes=walk,run --angles=45,180 --extras
```

录制器已完成语法检查，尚未浏览器运行；不能把准备好的脚本作为新候选已经通过或录制完成的证据。
