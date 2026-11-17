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
