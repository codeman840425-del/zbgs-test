# 当前角色基础工程恢复点

## 固定入口与备份
- F:/gamemake / feat/m1-foundation-room。4196 build1084ddeae27a，source55d363fbb2fae96e3b2e571a4f00de825545f537；独立experiments/m2-production-release-v2/prototype/dist。delivery/appearance-workbench.json；回退65814指针在delivery/history。4174历史证据、4195封存M1，不加常驻端口。
- 固定4196所属D02发布增量de2928b319917953cc8304029b85820a1778b766保留；最新生产主包代码与源/证据提交65310018381d1d40d26ba1f93a296153ea8c7b7e已推送，git ls-remote逐字核实。后续恢复说明独立提交，不冒称4196已换构建。公司副总工dirty文件不stage，不用git add -A。

## 刚完成D02限定主包
- source55d363/build1084固定；character-production query/create/edit/validate使用真实factory/事务/完整记录，候选在场景外准备，失败不动当前角色。CLI scripts/character-production-cli.cjs后台浏览器，不占桌面；输出必须显式新路径且不在evidence目录，关闭/证据成功后才原子发布。
- m2-production-fixed-v2是实际分进程原生男query/create/edit、原生女face create及真实二次consumer回读，6秒1×；transport沿旧锁/CAS import/read/export，原男rev1→2保持identity/provenance，结果在results。docs/PRODUCTION-FLOW-CLI说明请求和回读方式，flow.py仍只读索引，不混淆。
- m2-production-guards-fixed-v2实际坏字段/后域失败保原/取消挂起加载/材质复位通过。m2-production-room-{male,female}-v2各约17秒1×走路坐起离椅，动作后完整造型一致；root检查全时段2fps，头发入座外扬保留，未代判完整人工自然度。
- 独立包支持明确1–4记录JSON数组，不改控制器/不重新编译；game-record-production-runtime-reviewed.json只新增新pin，旧65814/7a03/801保持。experiments/m2-production-game-package-v1为50文件包；输入和逐文件证据m2-production-package-fixed-v1。入口record-consumer.html?records=/records/manifest.json，最多双实例。
- m2-production-package-browser-v3实际两记录完整恢复/关闭重开/1×影片与坏manifest无fallback通过。v1 QA漏await、v2路由glob误匹配HTML query保留DIAGNOSIS，runtime未因此修改。dev-room旧-0对JSON0比较失败保留。
- m2-production-rebuild-v2新检出npm ci/build全部字节一致；m2-production-release-ui-v2和public-v2真实4196原生女face/男/旧男mic/glasses按钮及记录入口通过。观看http://127.0.0.1:4196/native-production.html，汇总影片http://127.0.0.1:4174/evidence/m2-production-fixed-v2/。

## 当前下一主包与边界
- P04限定包已完成：record_budget.py复用collector/既有预算，source55d363精确原生男/女/旧材质男，6CPU和独审通过；v1漏计失败保留，v2补外置马尾6骨3碰撞体，旧非原发色明确unsupported。报告m2-record-budget-v2，不冒称全造型预算准入；3样件均有单件超限。
- m2-record-budget-runtime-v1：1084四组(原生男/女/旧男/双例)各12秒讲话，无录屏，开发机Chrome157/4090，角色纹理增量51/47/36/98，销毁回ground1；frame p95约6.2ms，全部帧数组保留。静态图片48/40/28与renderer不同口径（bone/morph等明确未计），非GPU字节/普通机/长期泄漏通过。
- 最新用户纠偏：暂停单件唇妆/模型精修，主包转CUSTOM-P01参数批产接缝。已确认原生MCP支持参数、D02支持已登记角色记录；卡在样件固定制作脚本→几何/装备/覆盖/挂点适配→编译进JS的登记。evidence/m2-next-native-mechanism-audit-v1/PIPELINE-GAPS.md分纹理、脸、躯干与拓扑依赖，不把两次换色当形体批产。旧女裙/30秒舞不动。
- 已实施第一段：scripts/production/native_import.py读取两个JSON spec，复用旧stager与raw bind检查，实际body SHA/三槽/coverage引用/文件闭包/整体目录发布、失败兄弟隔离及精确重试；7回归通过，旧两个8文件包字节保持，evidence/m2-native-import-batch-v1实际两包prepared→reused。此为已生产包离线准备，不是新参数导出/自动fit/运行时准入完成；4196不变。
- 参数批产制作已实际跑通：scripts/production/native_authoring/runner.py同一FaceContour模板两份数据，v2保存/冷开/截图/VRM原生导出成功，另外单项复跑VRM字节完全一致（.vroid容器不同，不承诺其字节确定）。12离线回归；v1缓存notice解析和迟开导出失败完整保留，经原生options离开导出屏恢复，无桌面/kill。evidence/m2-native-parameter-batch-v2，源assets-source/native-parameter-batch-v2与native-parameter-replay-v1。编辑器已回干净主菜单；源生成结束后通过官方vroid_exit(discard=false)正常退出，未使用桌面、未强杀，回执evidence/m2-native-authoring-session-close-v1。
- native_dependency_delta.py实际核self/历史face/waist/异模板及本批两VRM，7回归含body/hair morph-only漏检修复；只给需重验/已核输入不变，不签发fit。新两脸有4材质组变化、无node/skin变化；来源/导出/接入不是同一步。
- 下一主包仍CUSTOM-P01：用此批真实输出继续统一完整身体/独立装备/coverage提取，按差分触发眼镜/口型/头发等适配与共同注册，再走已有D02创建游戏记录/房间动作/恢复。不得再手写第二套按人物名字分支的控制器，不能只跑颜色两件或旧脸腰离线包就宣布几何批产完成。已有适配器优先复用参数化，失败只重做受影响环节。
- 用户问两皮肤为何丢功能：实际输入整个人物VRM；遗漏精确握姿/镜腿是我们接入交付缺口，不能作为合理免责。四native已补接，当前UI回归确认，其他功能仍按query实际登记，不继承旧体通过。
- 女裙和原30秒舞封板；普通电脑没有设备继续标未测，开发9950X3D/4090/Chrome不代表普通机。此轮未新造形体/压缩/公司/服务器。
- 后台脚本与Playwright；GPU录制一次一个。可继续复用的已知子agent：game_record_package(sol/high)、material_record_review(astra/high)、deterministic_record_batch(astra/high)。实际provider与hook interception未证明，不声称已强制拦截。
- 公司平台由副总工负责；保留其dirty文件。不主动外发消息或合并公司main。

2026-11-17 CUSTOM-P01 参数批产接缝已形成首个可重复闭环（技术候选）：同一 VRoid 2.16 FaceContour 模板的两份离散配方，经原生制作、冷开回读、VRM 导出、依赖差分、完整身体/上衣/短裤/鞋包、身体遮罩准入、精确握麦与镜腿数据登记后，进入共用角色目录。新增 `prepare_native_batch.py` 从 authoring result 自动生成打包配置；`native_body_package.py` 隔离重建两包逐文件一致。`register_native_packages.py` 与 `register_native_accessories.py` 均具备身份核对、幂等、冲突拒绝和失败回滚。证据：`evidence/m2-native-batch-config-v1`、`evidence/m2-native-registration-independent-v1`、`evidence/m2-native-batch-runtime-seam-v1`。

同一批两份记录已由实际 D02 CLI 创建，固定构建 `bda6fd250bb8`（source `48bb9f5d4ac34d7ee8704f7912c850cef02e3418`）在共用游戏消费者中完成双实例加载、持麦/眼镜、房间走路→坐下→起身→离开、关闭重开恢复及状态隔离；正常速度影片与 1× 近景保留于 `evidence/m2-native-batch-runtime-final-v1`、`evidence/m2-native-batch-live-v1`。这只是两份女性 FaceContour 配方的技术候选，不能外推到任意身体/衣物/颜色/发型；动作自然度和普通电脑性能仍需分别验收。

当前主卡点已从“每件模型手工接线”收敛为：不同几何/表情/发型/衣物仍需要按差分触发对应 fit 和覆盖复核；原生身体目前仅登记原色，眼睛/表情兼容尚未扩展到新 SHA；新增配方链已自动化，但生产结果必须经过共用运行链和记录恢复才可入库。4196 固定工作台仍保持 build1084ddeae27a，本候选尚未替换固定入口。

2026-11-17 4196 fixed入口更新：`delivery/appearance-workbench.json` 当前指向技术候选 build `bda6fd250bb8`、source `1b643d7e53491296fc75c721dd1224d9b3a2d233`，目录 `experiments/native-parameter-runtime-final/prototype/dist`；旧1084指针已归档为 `delivery/history/appearance-workbench-1084ddeae27a-before-native-batch.json`。4196 当前服务进程已核实监听；该入口是待人工观看的技术候选，不代表 M2 或视觉验收完成。

2026-11-17 CUSTOM-P01 批量记录接缝：新增 `scripts/production/native_record_batch.py`，从已登记角色目录读取身体、配方版本和精确道具 fit，自动生成稳定角色记录请求；未知握麦/眼镜 fit 按项省略并记录原因，不继承旧体配置。两项真实请求经 `character-production-cli.cjs` 创建后，构建 `bda6fd250bb8` 的双实例消费者完成 1× 记录回读、表情/讲话隔离、8 秒录像及浏览器关闭重开恢复。证据 `evidence/m2-native-record-plan-v4`。这解决了参数批产后最后一段手写记录接线，但仍只覆盖已登记的两份 FaceContour 女性候选。

2026-11-17 生产闸门复核：scripts/production/native_batch_gate.py 读取同一批两个实际 package、provenance、recipe 和 D02 双恢复报告，输出 evidence/m2-native-production-gate-v1/report.json。两项的 authoring/coldReadback/export/dependencyDelta 已验证，bodyPackage/coverage 已准备，runtimeCatalog/record/restore 有双实例关闭恢复证据；但每项仍列出 dynamicMotion、facialExpressions、handAndMicrophone、headAttachments、runtimeRecordAndBudget、surfaceAndTexture 六类受影响适配任务，acceptedForRuntime 为空。闸门按差分生成适配任务并禁止按名称或新 SHA 继承旧 fit，不是继续精修单件模型。

同日表情准入实测拒绝：evidence/m2-native-eye-admission-v9/cpu.json。两份新女性候选的 EYE_Joy/ALL_Joy/EYE_Close 索引分别为 17/3/13，面部 primitive 为 8 个、每个 57 个 morph；现有 eye-blink adapter 需要 9 个 primitive/56 morph，并依赖 EyeExtra_01_EYE，所以未生成 admission，也未改 runtime。该失败说明当前最大共同卡点是“原生导出结构 → 受影响适配器 → 准入”契约仍按旧脸部结构写死；修复方向是结构版本化的表情适配器和明确拒绝/回退路径，不是修改这两张脸的轮廓。

2026-11-17 表情结构适配已修共同链路：v9 的旧硬编码检查曾把新体 8 primitive/57 morph 拒绝为 9/56 不同结构；实际运行 adapter 已改为精确 profile，保留旧 female 9/56，并通过 `node scripts/test-native-eye-admission.mjs` 的旧体、新体 happy×blink 与双实例 owner 隔离。未改模型，未做 GPU/视觉宣称。生产闸门 v2 `evidence/m2-native-production-gate-v2/report.json` 已移除两项的 facialExpressions 任务；剩余五类受影响适配仍需逐条准入，当前 `acceptedForRuntime` 仍为空。

2026-11-17 批产接缝复核：`scripts/production/native_batch_gate.py` 已增加资源包闭包校验，只有 spec.files、身体 SHA、三件装备、coverage manifest 与各资产哈希一致时，`bodyPackage`/`coverage` 才标为 verified。adapter 报告必须声明自身覆盖的检查，未知 schema 不会清除任务；每个待办任务保留对应 provenance 引用，表情与握麦以精确 body SHA 记录 resolvedChecks。`evidence/m2-native-production-gate-v4/report.json` 的真实结果是两项各剩 `dynamicMotion`、`headAttachments`、`runtimeRecordAndBudget`、`surfaceAndTexture`，`acceptedForRuntime=[]`。根因已从“闸门恒假”收敛为逐身体适配证据缺口，不再通过精修模型解决。审查报告：`evidence/m2-batch-gate-review-v1/REPORT.md`。

闸门 v3 `evidence/m2-native-production-gate-v3/report.json` 接入两体握麦登记回执后，握麦任务已从批次卡点移除；剩余四类为发丝/头部附件动态、当前新体预算、表面/纹理以及完整视觉准入。该状态只针对两份女性 FaceContour 候选，不外推男性或任意服装。

2026-11-17 批产卡点从“模型精修”收敛为可复用适配闸门：`scripts/production/qa_native_batch_adaptation.py` 对两份 FaceContour 产物确认 nodes/skins/humanoid/expressions/VRMC_springBone 结构逐字段一致，27 springs/28 colliders 可复用；Body 2048² RGB/UV/材质合同和 608383 个覆盖 alpha 差异已核。HairBack 几何仍变化，因此 dynamicMotion 与头部挂点只标为需逐身体运行复核。

新增 `native_batch_gate.py` 的诊断输入会附带源侧适配审查和 runtime/head 预算审查，但不会把候选证据误标为通过。`evidence/m2-native-production-gate-v5/report.json` 当前两项仍各剩 `dynamicMotion`、`headAttachments`、`runtimeRecordAndBudget`、`surfaceAndTexture`；两体预算均为 `over-budget`，普通电脑未测，`acceptedForRuntime=[]`。这证明批量链路的共性制作、导入、登记和记录生成已经可复用，当前卡点是每个身体的受影响 fit 证据与素材预算策略，不是继续修改单个脸型。
`native_record_batch.py --readiness-report` 已接入同一 production gate：正式模式只生成 `acceptedForRuntime` 的精确 bodyType 请求；当前 v5 两体均被明确拒绝并保留 `runtime admission pending`，诊断模式仍可生成技术候选请求。这样不会把可回读的技术样件误当成可发布游戏角色。
当前资源预算包已完成分层记录：`budget-classification-v1.json` 将传输闭包列为已测，将解码/Canvas列为静态估算，将GPU与普通电脑列为未测；两项 FaceContour 候选仍为 blocked。KTX2 只保留旧801 pilot 的独立旁车结论，新身体尚未生成压缩派生物。下一步继续共用适配器和发布闸门，不再投入单模型外观精修；只有逐身体适配证据、资源预算策略和目标设备实测满足条件，才允许 `acceptedForRuntime` 非空。

2026-11-17 头部附件共用适配已进入候选阶段：新两体的未适配眼镜站/坐捕获和四环 fit 候选保存在 `evidence/m2-native-batch-runtime-seam-v1/native-glasses-capture-candidate-v1` 与 `native-glasses-candidate-v1`。这证明同一适配器可按精确 body SHA 生成候选，不代表眼镜已通过；下一步是固定构建中的正常速度近景/动作检查，再决定是否进入 source registry 和闸门。


## 当前主工作包：M2共同生产链路（2026-11-17）
- 主线已从单模型精修切换为“配方→原生导出→差分→资源包→准入闸门→确定性角色记录”。新增 `scripts/production/native_admission_cycle.py`，当前批次的实际运行结果保存在 `evidence/m2-native-admission-cycle-v1/summary.json`，状态为 `blocked`，两项均拒绝生成运行时记录请求。
- 技术回放已在固定 `bda6fd250bb8` 上完成：`room-roundness-a` 与 `room-cheek-b` 各自走路、坐下、坐稳、起身、离椅均完成，供人工观看；不等同视觉通过、普通电脑通过或M2完成。
- 下一步按共同机制推进：先解决头部附件的版本化证据与准入车道、动态头发逐身体运行检查、预算分层/发布派生方案和男性独立FaceContour观察；不覆盖冲突profile、不放宽超预算闸门、不重开封板裙装/30秒舞。
- 闸门已增加可选 `native-glasses-admission-v1` 车道；它只接受精确身份和完整运行/恢复/人工视觉证据，不会把现有 `verified:false` 候选升级为通过。
- 资源预算也增加 `native-budget-admission-v1` 车道；四层（传输、解码/Canvas、GPU、普通电脑）任一缺失或未测都不能清除预算 blocker。
- 恢复命令：从仓库根运行 `python -B scripts/production/native_admission_cycle.py`，使用当前批次和现有证据路径生成新的、不可覆写的 gate/record 输出目录；新增配方先产生新证据目录，再更新准入报告。

2026-11-18 生产链路继续收敛：两份新 FaceContour 身体已生成 source-only KTX2 发布旁车，脚本与证据为 `scripts/m2-ktx-pilot-v1/prepare-facecontour-sidecar.py`、`assets-source/m2-ktx-pilot-v1/native-facecontour-sidecar-v1/`、`evidence/m2-ktx-native-facecontour-sidecar-v1/`。旁车绑定精确 body/coverage/material identity，重复编码哈希一致；未改 VRM，未改运行时，未清除预算或 surface blocker。现有 KTX2 runtime adapter 仍只接受旧801身份，后续若接入必须另做 exact-resource loader admission 与 PNG/Canvas 回退验证。

同日批产入口增强身份与回滚保护：runtime report 必须带 record SHA 且与 staged body SHA 精确一致；readiness 记录请求按 bodyType→body SHA 对照 catalog；记录规划失败会删除本轮新写入的 gate/partial output。`python -B -m unittest discover -s scripts/production -p "test_native*.py"` 当前 46 项通过。当前 v5 gate 仍 `acceptedForRuntime=[]`；可观看结果继续使用固定 `bda6fd250bb8` 的 `evidence/m2-native-admission-cycle-v1/index.html`，这是技术候选回放，不是准入版本。

修复后的最新循环回执为 `evidence/m2-native-admission-cycle-v3/summary.json`：gate 仍 blocked，两个候选的 readiness 记录请求均拒绝，批次 `mode=readiness-gated`。这证明新失败语义已实际运行，未新增准入项；v1 的视频回放仍是当前可观看样件，v3 是最新流程证据。

共同适配审查已增加两个可重复入口：`evidence/m2-native-dynamic-motion-adapter-v1/report.json` 证明两体共享 spring 结构可计算指纹，但逐身体动态/头部 fit 和视觉证据仍阻塞；`evidence/m2-native-surface-texture-admission-v1/REPORT.json` 证明两体 Body 静态材质/纹理合同通过，运行时 WebGL 与人工视觉仍阻塞。当前没有任何新候选被误标为 runtime admitted。
2026-11-18 产品验收权重更新：游戏主要采用锁定/拉远的2.5D镜头，正常距离优先看轮廓、发型、服装区分、动作连贯和明显穿插；近景只用于发现结构性绑定、接触、资源身份和运行可靠性问题。视频/图片到动作的输入检查、骨架映射、批量导入、元数据和游戏回读提前列为M2共同工作包；已封存30秒舞不重开。

2026-11-18 共同资源矩阵接入：`assets-source/variant-matrix-v1/representative-matrix.json` 以精确 `bodyType` 登记男女基础制服和露膝短裤的代表变体；`character-production-query.js` 同时返回候选 `styleVariants` 与仅含 `runtime-admitted` 的 `runtimeVariants`。当前四项仍为 candidate，运行时准入列表为空；Node 查询6项、生产回归50项和 Vite 构建通过。该接缝验证了同一参数/资源契约可被男女角色查询复用，但不替代逐身体动态、预算、表面与附件证据。提交 `c134f405`。
复工后重新执行 `native_admission_cycle.py` 生成 `evidence/m2-native-admission-cycle-v5/summary.json`；结果仍为 `blocked`，`acceptedForRuntime=[]`。该结果是当前闸门的最新可复现状态，不是停工原因：剩余任务仍是动态、头部附件、预算和表面运行证据。
预算交叉验证脚本 `scripts/production/qa_native_budget_gate.py` 已通过32项只读检查，确认两体静态超预算、普通电脑未测、KTX2 旁车未接运行时且准入列表为空。4196 工作台新增只读“生产资源矩阵”区，男女基础制服和露膝短裤按候选/正式准入状态展示。相关回归包含预算50项生产测试、变体6项查询测试和工作台事件7项检查；最新提交 `4b9eca78`。
头部附件主包继续推进：固定预览 `c0f83a22c2f0` 已重新采集两份新身体的站立/坐姿未适配眼镜几何，并生成 `native-glasses-candidate-v4/result.json`。两体均为 `cpu-candidate-only`，没有注册运行时 fit；正式准入仍需正常装备、动作、关闭重开和人工视觉证据。
候选 fit 随后通过诊断参数 `glassesFit=candidate` 接入真实 Three.js/VRM 运行链。固定构建 `1cccc47bd39e` 的两体站立→坐稳回归均保持眼镜加载且页面无错误，证据 `evidence/m2-native-batch-runtime-seam-v1/native-glasses-runtime-candidate-v1/report.json`。该入口明确保持 candidate-only，不改变正式准入状态。

## 2026-11-18 角色与公司平台同步边界
- 已阅读副总工的公司平台启动说明及 C3 接缝记录。公司侧当前继续独立推进 C1/C2 设施资源、布局、保存恢复和生活小物生产包，最近工作包为边几与生活小物。该侧的灰盒房间、椅子使用点、请求终态和 seat lease 可复用，但现有主场景仍有写死房间/障碍、贪心路径和椅子布局预检缺口，必须继续标记为部分完成。
- 角色侧与公司侧的稳定交接字段确定为 `facilityId`、`usePointId`、`floorId`、`roomId`、`layoutRevision`、坐标空间及世界变换。角色控制器、动作时钟和 seat lease 只保留一份，C3 联调不得复制人物控制逻辑。角色记录消费精确 `bodyType`、资源 SHA 与 fit 版本，设施记录消费精确使用点与布局版本。
- 联合最小包安排为一份固定布局、一把椅子和男女各一个角色，验证接近、预约/占用、坐稳、取消、起身离位释放、双实例隔离、保存恢复和资源版本一致性。公司布局样件的可观看通过不等于通用设施系统完成，角色候选的 `runtime-admitted` 为空也不得被联调绕过。
- 当前两侧共同技术卡点是版本化资源身份、按需加载/预算和跨实例状态恢复。角色侧两份 FaceContour 候选仍有 dynamicMotion、headAttachments、runtimeRecordAndBudget、surfaceAndTexture 四类待准入任务，静态资源约 17MB 且普通电脑未测。下一步优先完成共性适配与预算证据，再接一份固定公司布局，不回到单模型精修或大规模装修款式。

## 2026-11-18 预览入口与交付物边界
- 4196 角色工作台和副总工当前回执中的 60880 公司平台都只用于人类观看、比较和验收。它们不是游戏内直接交付物，也不替代版本化源码、资源包、配置、构建、角色记录、设施布局和恢复证据。用户消息中写作 60800，当前实际监听端口核实为 60880，保留该差异记录。
- 副总工已回报边几与生活小物包完成并发布，固定提交 `35fbdebf`、固定源提交 `5c92a65f`、构建 `96210ac9f301`，独立交付目录为 `F:/gamemake-company-side-table-life-delivery-v1`。四款边几和四款台面小物完成固定/独立 CPU、浏览器、保存重启、父子移动旋转复制、承载与非法输入保旧检查。该包仍不含真实角色 C3 联调，SwiftShader/CPU 结果也不代表普通电脑性能。
- 副总工后续混合住宅包的固定版 QA 已通过 10 项，当前正在同一固定构建生成正常速度录像，并把混合住宅 QA/录像入口补入独立移交包。门框安装依赖真实外部门洞，门扇安装依赖门洞与门框，60880 仍是人类预览端口；角色 C3 等待该包固定移交字段后再接入。
- 角色侧新增查询接缝审查提交 `dc6067e4`，确认源矩阵从 `assets-source` 到 Node/Vite 生产构建可重复，男女各返回两个 candidate 款式，`runtimeVariants` 仍为空。当前角色候选准入和公司设施联调都必须继续经过各自闸门，不以预览入口可见或样件可加载代替正式交付。
- 角色侧随后在同一 4196 预览构建 `c5ce1f7126ab` 对两份精确记录完成动态开关诊断回放，覆盖走路、坐下、起身和离开，226/232 个采样均无页面错误。证据 `evidence/m2-native-dynamic-runtime-trace-v3a/summary.json`，仍为诊断候选，不能清除 `dynamicMotion` 或人工视觉/预算/普通电脑门。

2026-11-18 动态共同适配接缝：native_batch_gate.py 新增 dynamic_trace_index，严格绑定两份新身体 SHA、记录 SHA、报告路径和构建，接入 v3a 真实走/坐/站/离开采样。证据现在显示在每个批产行中，但其 technical-pass-diagnostic-only 状态的 clears 为空，因此 dynamicMotion 仍待显式适配准入，acceptedForRuntime 仍为空。新增 gate v6 报告 evidence/m2-native-production-gate-v6/report.json，17 项闸门测试通过。

2026-11-18 预算共同接缝：native_batch_gate.py 与 native_admission_cycle.py 现在可接收四层 budget-classification-v1 报告，按精确身体 SHA 展示 transport、decodeCanvas、gpu、ordinaryPC、资源超限和未测项。v7 报告已实际生成，两个候选仍为 acceptedForRuntime=[]，预算分类只作为诊断输入，不授予准入。22 项闸门/周期回归通过。

2026-11-18 表面共同接缝：native_batch_gate.py 与 native_admission_cycle.py 现在接收 native-surface-texture-admission-v1，按身体 SHA 附加精确 Body 图像/材质/UV/alpha 静态证据，同时保留 runtime 与 visual blocked 状态。v8 报告实际生成，两个候选仍未准入；23 项闸门/周期回归通过。

2026-11-18 admission cycle v8a：用动态、预算分层、表面静态证据重跑完整准入周期。gate 与 deterministic record planner 均正常运行，两个候选均明确 rejected/runtime admission pending，未生成任何运行时角色请求。

2026-11-18 头部附件证据接缝：native_batch_gate.py/admission_cycle.py 已统一附加眼镜 candidate-only 与麦克风 cpu-candidate-only 报告，均按身体 SHA 校验，站/坐加载状态、握持和口型资源身份可回溯，verified=false 且不会清除 headAttachments/handAndMicrophone。v11 报告和25项测试已完成。最新房间回归证据 m2-native-room-current-v3 在构建 c5ce1f7126ab 两体均 technical-pass-visual-candidate，页面错误为0。

2026-11-18 复工后准入身份加固：候选表面、眼镜和麦克风证据除身体 SHA 外，现要求 bodyType 与批次 profile 精确一致。v12 闸门报告生成，25 项回归通过，两个候选仍未准入。

2026-11-18 复工后房间证据接缝：准入闸门现在可读取当前构建的 room candidate 目录，校验 input record、bodyType、身体 SHA、record SHA、4项动作任务和页面错误，并按身体附加录像/回读证据。v13 报告两体均有4项任务，仍为 visual candidate，acceptedForRuntime=[]。26项回归通过。

2026-11-18 admission cycle v13a：房间候选目录已沿完整 admission cycle 传递，gate 能保留两体当前构建的4项动作回归、录像和记录身份，record planner 仍对两体返回 rejected/runtime admission pending。

2026-11-18 复工旁车资源接缝：新增 `prototype/src/native-release-sidecar.js`，按 `bodyType` 与 `sourceModelSha256` 精确选择 FaceContour KTX2 候选，并在身份未登记时返回 PNG 回退。候选必须保持 `candidate-only` 且清单 `runtimeAdmission=false`，不会进入正式资源目录或改变 4196 默认材质路径。旁车解析测试3项、角色查询与生产回归59项通过，提交 `39da46fe` 已推送并核实远程分支。

同日 admission cycle v14：使用当前动态回放、表面静态审查、资源预算分类、头部附件/持麦候选和房间回放重新生成 `evidence/m2-native-admission-cycle-v14/`。两份候选的 `facialExpressions` 与 `handAndMicrophone` 已按精确 SHA 解析，剩余 `dynamicMotion`、`headAttachments`、`runtimeRecordAndBudget`、`surfaceAndTexture`，`acceptedForRuntime=[]`，记录规划仍明确拒绝未准入项。该结果修正了旧 v13a 汇总未带入最新证据的问题，不改变准入标准。

旁车清单随后补齐运行时材质目标合同，包括 `materialName`、`materialIndex`、`imageIndex`、2048² 尺寸及 Body 的 MToon alpha/纹理索引合同。清单生成、精确解析、缺失目标拒绝和完整生产回归通过；仍是 `candidate-only`，未接入正式材质替换。

2026-11-18 头部附件候选链回读：当前源码构建 `c5d7f7dca6f2` 对 `native-contour-roundness-a-v1` 与 `native-contour-cheek-b-v1` 完成眼镜启用、正常速度走路→坐下→起身、页面关闭重开后再次加载。两体均 0 页面错误，三段动作快照的眼镜加载状态为 true，`eyeBlinkCompatibility.available=true`。证据 `evidence/m2-native-batch-runtime-seam-v1/native-glasses-runtime-candidate-v4/report.json`，仍为 `candidate-only`，没有写入正式 fit registry，不清除 `headAttachments` 或人工视觉准入。

2026-11-18 admission cycle v16：以 v4 头部附件候选链重新汇总，状态仍为 `adapter-work-required`，`acceptedForRuntime=[]`。四类未完成任务保持为 `dynamicMotion`、`headAttachments`、`runtimeRecordAndBudget`、`surfaceAndTexture`。v16 证明候选链已进入共同闸门，不代表眼镜或两份 FaceContour 身体已正式可用。
