# M1 新完整人体独立 QA

状态：2026-11-14 新固定候选 `66a09d34d8fe` 已完成本轮有界独立验收：脚锁/真实步行、六场座接触、中断换装、点击响应以及重新录制的三外观连续链。正常步行大故障不再复现；裙边缘接触、布料自然度及目标PC实机性能仍未全部通过。旧 `7127534d2536` **M1不通过并保留为失败基线**。仅新 `Base_Female`，不继承旧体型通过结论，不据此批准批量角色/服装生产。

## 资产与接口边界

- 主人体 profile ID：`beta-base-female-m1`；roundtrip VRM SHA256：`027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。
- `avatar.getAssetProfile()` 提供 `id/url/sha256/meshRoles/qa.outfits`。网格角色 `body/footwear/pants/skirt/top` 优先取 profile 的 mesh UUID 或 `userData.assetRole`。UUID 每次加载变化，不能写死到测试。
- 骨骼用 VRM humanoid 语义 `leftFoot/rightFoot/Toes/UpperLeg` 映射 raw 节点对象，再读取 skinIndex/skinWeight。没有 `Body_1` 或旧 raw 骨名依赖。
- 鞋检测读取当前可见鞋网格，实际 `getVertexPosition()` + matrixWorld；只测 index 引用顶点，尊重 drawRange。无鞋则明确 `barefoot-body`；无可分类表面则 `measured:false`，绝不退回脚踝当脚底。
- 椅子用 `__debug.chairColliders()` 的语义名、真实 mesh 和 localBox；每次取最新逆矩阵。检测不依赖椅子坐标/children顺序。测试场景移动椅子的坐标是可重复输入，不是检测器的假定。

## 有界测试脚本

### 固定版执行入口（2026-11-14补强）

`qa-m1-common.cjs` 现在在动作前/结束后同时核对运行时build、服务器build-info完整digest、主角色profile ID/URL/声明hash和实际主VRM bytes hash；拒绝development/HMR候选。不能只因后台预加载过某个VRM就认定当前正在测试它。任何pageerror、超时、未完成状态或检测到的座位侵入都保留数据并非零退出；失败/中断另存failure.json。已实际用错误期望ID `deadbeef1234` 请求4191：入口在动作前拒绝并串行停止，证据 `output/playwright/m1-gate-check-20261114/`。这只验证gate，不是旧712验收通过。

串行runner不启动服务、不并发浏览器，每阶段有限超时。默认顺序 inventory→foot-lock→walk→chain→seat→interactions→response→summary；可分阶段选，统一在同一build目录下分别写walk/chain/interactions/response等。已有完成/失败证据不覆盖，必要重跑明确给新的QA_M1_RUN_ROOT；每次调度日志单独存`runs/<timestamp>/`。

```powershell
$env:QA_M1_BUILD='<新的固定ID>'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
# 只打印顺序、超时、输出位置，不开浏览器
node scripts/qa-m1-sequential.cjs http://127.0.0.1:4191/ --plan
# 技术负责人先验脚锁和正常录像
node scripts/qa-m1-sequential.cjs http://127.0.0.1:4191/ --stages=foot-lock,walk
# 上一命令结束后独立QA再串行执行
node scripts/qa-m1-sequential.cjs http://127.0.0.1:4191/ --stages=chain,seat,interactions,response,summary
```

`qa-canvas-video.cjs` 同样强制上述环境身份，记录每片前后gate、浏览器/viewport、pageerror；每片立即落盘，失败尽可能保留`-incomplete.webm`及telemetry。路径结束需真实到目标，不能以取消路径后idle误判到达。镜头按当前人体高度取比例；准备位置通过房间控制器到达，不强写root。请求60fps仍需另核编码时间戳，不能自动称60fps录制/目标机器性能达标。录屏时不得同时启动其他QA浏览器。新入口尚待新固定ID执行完整链；当前只通过语法检查与负向身份gate实测。

`scripts/qa-m1-probes.mjs`：浏览器只读 inventory、实际鞋面、座位、raw/normalized 骨点、输入响应与逐渲染帧脚面 trace。支撑标记只作并列记录，不按 contact 过滤样本。最低点 delta 是该材料顶点相对上次采样的位移，不是“连续最低顶点”的差；还不能据此宣布完整支撑区无滑动。CPU 几何采样会影响帧耗时，不能拿这组 rAF 数据当性能达标依据。

`scripts/qa-m1-run.cjs`：固定构建通用 inventory / contacts / chain / response。强制提供预期 build 与新资产 SHA；可另锁 profile ID。读取加载资产实际 bytes 计算 SHA。chain 使用明确审核过的房间路径、相同相机比例与朝向、profile/config 外观清单；记录起停、路径、坐起、舞蹈的完整视频及每帧鞋面。response 使用真实鼠标点击，保存 pointer/command、root/yaw/target 原始 trace。收集成功不自动判通过。

```powershell
$env:QA_M1_BUILD='<固定构建 shortId>'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_M1_CONFIG='<明确审核路径/外观/响应目标的 JSON>'
node scripts/qa-m1-run.cjs http://127.0.0.1:<既有端口>/ chain
```

配置字段：`assetId`、`floorY`、`speed`、`outfits:[{name,bodyMode,outfit,dynamics}]`、`path:[[x,z],...]`、`danceSeconds`、`responseTargets:[{name,x,z,observeMs,reset}]`。没有旧房间路径或旧外观编号默认值。`reset:false` 用于途中改目标响应。

`scripts/qa-m1-seat.cjs`：开发阶段独立 base/pants × 默认椅、移动旋转椅、旋转椅角回归位置；实际走到椅子，不传送人物。模拟步长 1/120 秒，坐起每4步采样实际鞋面、骨点和全部可见网格/座背顶点相交。记录每个场景、截图、超时状态、主人体 bytes hash、运行前后全部 src/*.js 哈希。无需起服务：

```powershell
node scripts/qa-m1-seat.cjs http://127.0.0.1:5173/
```

这是数值检查，不是正常播放连续视觉验收。座面局部 gap/depth 采用椅局部单位；当前椅子为单位缩放才可换算毫米。顶点-盒检查不能证明所有三角形或扫掠体完全无穿插。臀部语义权重范围包含大腿，需结合具体顶点及视频判断。

## 旧脚本审计

| 旧依赖 | M1 处理 |
| --- | --- |
| seat-contact-probe 椅 x≈2.65、六children、前两项座/背 | 只用 chairColliders 语义和局部盒 |
| garment-contact-probe 的 Tops/Bottoms；qa-body-surface 的 Body_00_SKIN | profile meshRoles，缺失时明确未分类 |
| gait 的 Shoes 字符串与旧目标步幅1.2877704568 | 实际 footwear UUID；步幅读取新 motion，不能继承旧比例 |
| qa-posture 外观0/1/2、旧体型膝角阈值、固定路径 | profile/config 外观及审核路径；不以旧膝阈值定义自然 |
| 视频固定镜头高度1.35/目标.85/距离3.2 | 同新体型头高计算固定比例镜头 |
| locomotion 只有 solver slip | 并列真实鞋网格采样；零IK残差不代表零滑步 |

源动作1.3米/周期仍是已核实的 Quaternius 源事实，但目标周期必须乘本次新体型的实际 retarget ratio。

## 当前实际结果与保留失败

开发 ID `f5956307d0a0`，证据 `output/playwright/m1/f5956307d0a0/seat-1794680111981/observations.json`（当时列出的6份集成src前后hash一致，后续脚本已扩为全部src/*.js）：

- base 默认/旋转椅均完成坐起，实际身体臀腿最低点距座面 +0.780 mm；坐起采样未见可见网格顶点在座/背盒内部。
- pants 默认/旋转椅均完成坐起，但裤5顶点穿座、最深1.480 mm，坐起过渡各2个采样帧见该问题。角色腿部实体未穿板。此项是失败，已交主代理修复，待复测。
- 实际鞋面每侧287/283个顶点；坐稳最低点约 −1.08/−1.38 mm，裤约 −1.10/−1.40 mm。不写成接触为零。
- 旋转移位可达椅：相对默认 x−1.3、z−.6、yaw60°，局部座接触数值与默认一致。
- 另一椅位置 x2,z.573327367,yaw60° 在走近椅角后变idle取消sit。`seat-1794680046429/base-rotated.json` 保留失败；audit已定位离散 lineClear 漏过约29 mm的旋转椅角相交区。该轮脚本最初未显式还原椅子，因此 pants/default 标签实际仍是该旋转椅；以JSON真实chair为准，未据此给默认裤结论。新脚本已每场景显式重置椅。
- 裤接触修复后一次复跑遭 HMR 导航中断，不视为通过，单场景数据保留。

## 固定候选 7127534d2536 复测

所有路径均是新人体；主资产 bytes hash 与 profile 已核对。数据路径 `output/playwright/m1/7127534d2536/`。

**阻断问题优先于下表局部成功**：`walk/continuity.json` 记录normal-front在phase .498661时单帧脚位移0.870247m，对应rAF6ms、hip步长5.31mm；这是姿势/支撑切换错误，不能归因平均FPS或截图抽样。`chain/review/chain-00.jpg` 的4.5秒帧可见一腿异常大幅侧甩，与数值定位一致。最初“旧释放阈值不适配新体型”的猜测已经被纠正：实际是按x±7cm筛选鞋底把左右脚顶点混在一起，摆动脚借用了支撑脚低高度。最终只改同侧Foot/Toes/LowerLeg权重筛选，保留原支撑/释放逻辑；详见 [M1-FOOT-LOCK.md](M1-FOOT-LOCK.md)。开发源码回归不能使712失败版自动通过。

`skirt-compare/corrected-540.png` 的起身中段近侧手/前臂末端进入裙面。独立代码审查：裙前panel按thigh/chair约束抬离身体，但源sitExit手仍贴大腿，缺少hand/forearm互斥约束。已反馈主代理；不可把手被裙遮住称为视觉通过。

| 检查 | 实际结果 | 边界 |
| --- | --- | --- |
| base/pants × 默认椅、移动60°椅、原漏角位置 | 六场全部走到座位、坐下和起身；过渡采样及坐稳0可见顶点进入座面/背板局部盒 | `seat-1794680394193/`；120Hz模拟、30Hz几何采样，不是三角扫掠证明 |
| 裤座修复 | 默认/旋转裤最低间隙+0.295mm；原漏角椅+0.544mm | 前一版1.48mm穿入已消失于此采样 |
| 身体座接触 | base +0.780mm；裤模式身体+6.16mm（为裤层留空间） | 姿势权重组含大腿；单位缩放椅 |
| 鞋底 | 坐稳约−1.1/−1.4mm | 仍有毫米级入地，不是零；没有用踝骨残差冒充真实鞋底 |
| 正常播放同镜头链 | base/pants/skirt均走左右代表路径、停、完整360°、坐起、再次走、舞蹈4秒和退出；0 pageerror | `chain/same-camera-chain.webm`，约125秒；没有开启逐帧重几何探针。源Dance_Loop为1秒，4秒覆盖至少完整循环 |
| 坐下25%/65%时改走 | 606/640个120Hz步后到目标并idle；连续单步hip最大12.65/13.40mm | `interactions/`，全程最大包含正常行走，不能单凭此判断观感 |
| 舞蹈改走 | 284个120Hz步后到目标并idle | 状态完成，不替代视觉 |
| 站/坐换裙裤 | 每姿势4次切换，采样第0/1/3/11/59帧；无非有限顶点、无异常膨大、无座背入盒，0 pageerror | 最大可见单网格尺寸约1.58m站/1.28m坐；未据此证明所有皮肤/服装三角无穿插 |
| 约179.89°实际鼠标反向 | 事件到朝向变化9.7ms、方向误差<.02rad用1059.1ms、根移动>1mm1120.2ms | `response/observations.json`，当前开发机一次实测；旧约4秒不再复现 |
| 途中150.7°改目标 | 朝向变化10.2ms、对齐889.8ms、再次位移1120.6ms | 新目标实际处理；初始forward位移30.2ms。视图投影点击有约毫米级目标偏差，记录实际command目标 |

正常录像没有重几何采样，但录制过程曾有独立数值浏览器并行约7秒；因此录像只用于动作/外观证据，不用于帧率验收。性能测试由主代理另开无其他测试浏览器的轻量采样，不能从这里的平均FPS推广。

`scripts/qa-m1-interactions.cjs` 保存中断/换装检查；`scripts/qa-m1-filmstrip.py` 产生带时间码的完整时长采样图。filmstrip默认2fps，仅供审看覆盖，不能称25/60fps逐帧全部检查。正式视频保留完整播放速率供复核。

## 固定候选 66a09d34d8fe（2026-11-14）

所有本轮检查使用隔离dist `experiments/m1-66a09d34d8fe/dist`，由`run-fixed-check.cjs`临时服务承载、检查退出即关闭。前后runtime/served digest与主人体bytes gate通过；没有将正在变动的5173开发代码称为固定候选。

- 独立六场base/pants×三椅均到达、坐下并起身，过渡采样/坐稳0可见网格顶点进入座背盒。base臀腿gap+0.780mm；裤层gap+0.295mm，原椅角位置+0.544mm；鞋底仍约−1.1/−1.4mm。证据`seat-1794682946622/`。
- 坐下25%/65%时请求走路与舞蹈中请求走路均完成，分别5.05/5.33/2.37秒模拟时间；站/坐各4次裙裤切换无非有限顶点和座背盒侵入。此为数值状态/接触采样，非所有身体-衣物三角通过。证据`interactions/`。
- 真鼠标179.89°换向：首朝向变化7.8ms、方向误差<.02rad用1057.6ms、root>1mm用1118.1ms。途中150.6°改目标：11.6/885.6/1115.9ms。当前开发机单次，非目标PC指标。证据`response/`。
- 主代理固定版脚锁矩阵：0.35/0.85/1.5m/s的实际鞋底支撑单帧位移0.392/0.241/0.369mm，整段平面漂移3.54/3.42/3.25mm，最低patch约−1mm；0.87m脚跳不再复现。完整数据`foot-lock/matrix.json`，不能把脚踝正常摆腿位移当滑步。
- `walk/`是裤装四片，记录条件与712旧片有差异；真正同旧条件的基础模式正常侧面在`walk-baseline-match/`，恢复1440×1080、3.2m镜头距离、.85m视线及原setup。对照不得混淆这两组。

初次完整链在pants段63.21秒仍为outfit0，73.09秒坐稳时变成outfit1；因此裤装坐起/舞蹈标注无效，原片原样保留在`chain-rejected-outfit/`。没有调用日志，来源未确认，不称为已修复产品bug。单裤headless复现`pants-diagnostic/chain/`始终outfit0、仅初始脚本一次setOutfit(0)、0真实pointer，未复现改变。

补录完整三外观链使用`qa-m1-chain-guarded.json`：原viewport/镜头/路径/1x不变，headless隔离人工输入，逐rAF校验controller与asset outfit并保存setOutfit栈/command/pointer日志，异常即中断保留。未拼接单裤补片冒充连续全链。新正式入口`chain/same-camera-chain.webm`约127秒，17074个渲染采样帧外观全部一致，只有3次预期setOutfit(0,0,1)，0真实pointer/click、0pageerror。`summary.json`已经重新生成并指向新链；汇总器现在也检查实际外观，拒绝将错误标签片汇总成成功。

独立视觉审看覆盖完整时长的13页2fps时间码图（`chain/review/`），明确不是全25fps逐帧检查。未见旧大幅甩腿；裤坐起约71–74秒、裙坐起112–115秒的采样姿态与椅位置合理。裙起身114–114.5秒近侧手持续可见，没有旧图那种整手埋进裙面；但前摆仍偏硬折片，手指/裙边的细小交叠不能宣布清除。舞蹈背视为主，该角度和采样率不证明前侧手裙接触及所有抬臂/抬腿范围。正常速度完整视频保留供产品观感判断。

手裙仍有边缘接触命中，主代理报告最终49条边缘rail命中、中心线0；这不等于完整表面无穿插。需要看裙坐起和舞蹈，而非仅据中心探针宣称通过。

## 目标设备与未验证项

普通电脑浏览器优先，手机后续。暂定目标：i5-1135G7 / Iris Xe / 16 GB / Windows 11 / Chrome，1440×900，60 FPS；尚未目标实机测量。

实际当前开发机已通过系统查询核实：AMD Ryzen 9 9950X3D、RTX 4090（另列集成AMD显卡和远程显示驱动）、约61.6 GiB可见物理内存、Windows 11专业版10.0.26100。GPU列举不证明Chrome当前选择哪个渲染设备。此机运行不代表上述普通电脑达标。

仍待：手指/裙边等完整表面接触、布料自然度、舞蹈前侧及更大动作范围验证、目标设备性能和用户观感决定。主代理已有当前固定版正常正/侧、慢/快三档录像及三速度实际鞋面矩阵；完整链/真实点击/裤座/旋转椅结果见上文，但不能推出所有动作或服装通过。性能必须关闭重几何探针并分开运动/VRM/服装成本。CPU节流只能称近似CPU压力测试，不能冒称手机GPU测试。任何一项不得以旧4180或上轮4191通过来替代。
