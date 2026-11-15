# 同版连续用户链与可靠性入口

状态：**175 已完成有界实测；实际后台未验证，整片自然度待审**。当前针对固定 `175a487d5ea3`；旧历史通过不转记为 175 通过。对应目标为 `M1-ACTIVE-OBJECTIVE-2026-11-14.md` 第 3、5 工作包。仅增加 QA，不修改 runtime、CURRENT 或 CAPABILITIES。

首轮 `final-user-01/user-chain` 保留实际失败及录像：女性真实走到坐讲完成，卸麦后下一帧 controller 的 `greetingReady()` 已为真，但实际 outgoing arm 权重仍 0.922，live 层以 `greeting-requires-settled-empty-hand-pose` 拒绝招手。不是坐姿破坏；两个 ready 条件不同。第二轮 `final-user-02` 仅在 QA 中等待真实 `live.arm===null` 后请求空手招手（与已有招手专项相同），没有修改运行时或抹去首失败。即时按钮是否提示等待由产品主线处理。

## 175 实测结果

- `final-user-02/user-chain`：女性裙和男性短裤各 **25 项状态检查通过**，分别约 **41.73 / 41.22 秒**真实连续采样，完整 WebM 位于各 case 的 `continuous-chain.webm`。不代表服装几何或自然度通过。四张关键截图已实际查看，全身/椅/装备可见；尚未连续审完两片。
- 两片起始都是 room 外参 `[5.8,4.5,7.8]` / target `[0,.65,0]`，但女约 26.12s、男约 32.29s 后相机 position 变化，mode 仍 room。原因未确认，日志保留。因此可以证明完整用户操作，**不能称全程严格固定外参，不能用于同镜头旧新对照**。
- `final-user-02/room-tasks-female-*` 与 `room-tasks-male-*`：男女 / 男男各 **19 项**通过，同椅竞争、终态、取消/超时及销毁释放按实际控制器执行；这是加速功能回归。
- `final-user-02/peer-ready-*`：female/male 各 success/cancel/503 共 **6 项**，最终 retry 成功；主实例未被销毁或改变。加载路径检查不代替双实例完整动作/性能。
- `final-user-02/avatar-record-v2-*`：**2 个基模、26 个错误记录拒绝**，本地保存重开恢复通过；实际build/基模/装备/握姿版本校验，0 pageerror。
- `final-user-02/lifecycle-fixed`：首测真实后台未成立，按当时脚本提前停止；保留失败。
- `final-user-03/lifecycle-fixed`：同 context 新标签 bringToFront 仍始终 `document.hidden=false`，visibility事件数组为空；后台记 **未验证**。不伪造事件。其余 **12 项**显式暂停、两种窗口尺寸、3次换装/peer创建销毁、20s有限持续运行、根有限值和0 pageerror通过。整阶段仍非通过，退出码1明确保留缺口。
- lifecycle 首次 ready 墙钟 1817ms，非冷缓存证明；renderer计数开始88 geometries/44 textures，最后89/45，不能称资源完全回到基线或无泄漏。JS heap约91.5→88.1MB，仅短期趋势。

当前实际女性皮肤×裙三角交叉已由另一专项确认（尤其起身/派生），本用户链不测三角，不得抵消该失败。后台、严格同镜头连续观感、普通目标机和更长稳定性仍缺口。

abdb已接入新 readiness 共用谓词，**不属于175**。新构建实际运行了 `scripts/m1c/qa-greeting-readiness-fixed.cjs`：男女站/坐四组，真实持麦权重>.99→卸麦仍>.001时两个ready均false→自然退场后均true→真实招手完成。abdb男女站/坐四例已实际通过，证据 `evidence/greeting-readiness-abdb/report.json`。这只更新ready缺陷结果，不把175整链改记成abdb全链通过。

## 复用与缺口

|范围|入口|覆盖 / 不能代表什么|
|连续代表用户链|`qa-m1-user-chain.cjs`（新）|女性裙、男性短裤；真实 1× room 镜头；UI 长短/裤裙切回；走跑重选→持麦眼镜坐讲→暂停→拒绝持麦招手→卸麦坐姿招手→起身走到舞区→源舞至少3圈→取消→技术舞完整7.2s结束→再次舞蹈被走路中断→卸装。**全程没有 reset、传送、advance 或 simulate。** 完整录像、rAF状态、命令和终态日志；仍待运行和连续观感审查。|
|任务、默认同椅、男女及男男|`qa-room-behavior-tasks.cjs`|已有实际任务/椅预约、占用、退出、重复、取消、超时、销毁检查；新增可选第三参数 `male` 复用同样用例测男男。开场链连续，独立边界用例仍有 reset；120Hz 手动模拟不能充当整段观感或性能证据。|
|异步过时、失败清理重试|`m1c/qa-peer-ready-fixed.cjs`|已有 male primary + female/male peer；延迟 motion 时不入场、取消、503、资源释放、成功重试，实际主实例姿态/资源不变。只覆盖该加载边界，非所有网络失败。|
|本地保存恢复|`qa-avatar-record-v2.cjs`|既有 QA-only 本地记录→关闭页→同 origin 重开→校验身份/装备/握姿版本恢复，以及无效记录拒绝；非产品存档UI、经营存档、服务端。新增 `QA_RECORD_CATALOG` 指向独立同版清单，不改旧记录。|
|真实后台、窗口、有限重复使用|`qa-m1-lifecycle-fixed.cjs`（新）|headed Chrome 新标签实际置后台1s/返回、暂停、900×700→1440×900、3次服装与男女peer创建销毁、20s持续运行。若 `document.hidden` 不成立则失败并标未证，**不伪造 hidden/事件**。renderer counter/JS heap仅趋势，20秒不算长时浸泡。|
|完整招手专项|`m1c/qa-greeting-fixed.cjs`|原有男女3组合、站坐招手、暂停/取消/重播、附件互斥、男女实例招手隔离。椅前传送/setup明确，不等同整链。可单独选 `greeting` 阶段。|
|原直播专项|`m1c/qa-live-fixed.cjs`|旧源码记录手/麦近似接触、眨眼/程序口型/视线等；含传送+固定步累计，不是新整链。默认旧build且覆盖保护较弱，**不纳入默认runner**；不复用旧片作为175通过。|
|真实短音频|`m1c/qa-dance-audio-playback-fixed.cjs`|已有明确音频窗口/QA harness，单独运行；不与本录像或性能并行。本新增链没有声音，不证明听觉同步。|
|几何 / 派生 / 目标机性能|既有各专项|本runner不替代足锁/椅座/手裙真实几何、jaw/waisthip整链、普通电脑GPU、双实例持续成本及正式正常速观感。|

旧 `lifecycle-check.generated.js` 没有固定身份gate；`scene-lifecycle-check.generated.js` 明确伪造 hidden，只能证明事件处理机制。因此不将它们作为真实后台通过入口。

## 已做的离线核查

- Node 语法检查通过；新 chain/lifecycle/runner `--plan` 只输出计划，不启动浏览器。
- 源完整输入散列匹配 175 digest：`175a487d5ea37afa9e2da8176ffccc1cfa92f9b87434a0f6126151eae25e4d2a`。
- 旧 v2 fixture 绑定 `38ea4eda48aa`，保持原样。
- 已运行既有 `build-avatar-record-fixture-v2.mjs`，从 175 固定资源及匹配源码生成 `schemas/fixtures/avatar-record-catalog-v2-175a487d5ea3.json`。生成器核对装备/槽位/基模/绑定/文件SHA/握姿；不是只改build字符串。175实际浏览器保存恢复后来已完成，结果见本报告上方；该fixture不适用于后续abdb或手修复候选。

## 窗口释放后可直接执行

PowerShell，仓库根 `F:/gamemake`，先由负责人分配独占浏览器窗口；不并行录像/性能。全流程严格串行，首个失败即停并保留输出，临时服务随子程序退出。

```powershell
$env:QA_M1_BUILD='175a487d5ea3'
$env:QA_M1_ASSET_ID='beta-base-female-m1'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_RECORD_CATALOG='F:/gamemake/schemas/fixtures/avatar-record-catalog-v2-175a487d5ea3.json'
$env:QA_M1_RUN_ROOT='F:/gamemake/output/playwright/m1/175a487d5ea3/final-user-01'
$env:QA_HEADLESS='0'
node scripts/run-fixed-check.cjs experiments/m1-integrated-contact-1/dist scripts/qa-m1-final-user-sequential.cjs --stages=chain,tasks,tasks-mm,peer,restore,lifecycle
```

按窗口可拆阶段，用同一 `QA_M1_RUN_ROOT` 汇集不同目录。重跑已经有证据的 chain/lifecycle 必须换新根目录，不能覆盖失败。`--stages=greeting` 可补完整招手专项，默认不重复录这组。

仅检查调度计划（不打开任何服务或浏览器）：

```powershell
node scripts/qa-m1-final-user-sequential.cjs http://127.0.0.1:1/ --plan
node scripts/qa-m1-user-chain.cjs --plan
node scripts/qa-m1-lifecycle-fixed.cjs --plan
```

未来固定ID变化时，先用匹配源码重新生成独立清单，**不要只更新期望ID或沿用175清单**：

```powershell
node scripts/build-avatar-record-fixture-v2.mjs <fixed-dist> --source-root=<matching-prototype-source> --out=schemas/fixtures/avatar-record-catalog-v2-<build>.json
```

runner 的 `runs/<timestamp>/runner.json` 和每阶段 `.log` 保存已开始/完成/失败；chain 另保存每个case完整WebM和report。成功状态仅为 collection-complete，正常速度观看、视觉问题判定及目标机性能另行记录。首次加载耗时受本机缓存影响，不称冷启动网络成绩。
