# 当前角色工程：恢复入口

更新2026-11-15，F:/gamemake，分支feat/m1-foundation-room。先读本页、AGENTS、CAPABILITIES与FOUNDATION-MILESTONES。历史流水已存docs/history，不回退或重复制作。

## 固定入口

- **4196 /?workbench=appearance：bcade40d24f1**。目录experiments/m2-appearance-workbench-v22/dist，源码c2224049a983b5e1af9e713e6938294bc0478e10，指针delivery/appearance-workbench.json。公开header/build/runtime与男女同文档/三分区smoke通过：evidence/current-workbench-bcade40d24f1；正常1×旧新换人录像与新增等待状态回归：evidence/body-switch-compile-browser-bcade-v1。a0dd/v21直接回滚，1fff/v20及更旧固定目录保持。
- **4195：77e46efb5441**，用户已限定接受的M1基础，未改。4174提供证据；临时QA端口4277在本次收尾后关闭。其他未知/顾问服务未动。
- Phaser3.90.0 + Three0.187.0 + three-vrm3.5.5；Rigby2D及真实多人服务器不参与当前工程。

## 最新实际成果与证据

1. 男女顶部独立按钮；组内原版/下颌/腰胯样件只列当前性别。页内异步换身体不刷新文档；外观/动作/检查分区，镜头/暂停/停止常驻。两尺寸1280×720、1600×1000的分区与真实文件入口通过；男女新短发及发/眉联色、肤/虹膜/外唇色沿已验范围。仍待用户新外观/分区观感。
2. v4本机草稿新增**下载配方/读取配方**；同原schema、精确base/资源/fit/几何身份。文件不含模型本体/动作/镜头/账号；先选对应基模，不同基模明确拒绝。两份配方各在空白context真实选择文件→下载逐值一致，失败保原与异步取消通过。男女两份实际代表文件在evidence/appearance-recipe-runtime-89480cf8f66c/representative-{female,male}.json；同姿room/近景、两条完整1×UI讲话片均已保存。aa再次回读两代表文件与jaw文件通过；不把颜色当捏脸。
3. 原男女嘴宽±4%，眉位/鼻尖/眼裂宽+1%各一个端点保持。新男性下颌只**嘴宽原位/+4%**，其他眉鼻眼仍未适配；按facial-geometry-profiles.js精确SHA配置、共用求值，2%/负值拒绝。源assets-source/m2-male-jaw-mouth-v1与scripts同名目录，40产物/7依赖，编辑源、fresh重做与原底都保留；不是换SHA复制原嘴配方。28点法线邻域与jaw重叠重新计算，源/运行CPU与原男女12组合逐字节回归见evidence/m2-male-jaw-mouth-runtime-v1。实际最终aa的有限表情同姿、短裤讲话/走停/重置和干净context配方见evidence/m2-male-jaw-mouth-browser-aa6fc6159e2d。未见新增明显唇裂/黑斑，不等于完整M2或任意组合通过。
4. 原源happy与blink叠加闭眼导致中央睫毛隐没，现仅对实际眼部primitive使用已有EYE_Joy补偿，不淡出眉/笑嘴、不改源形态。原男女/5身份CPU与24同姿对、4条完整1×实录在evidence/eye-blink-compatibility-v1、eye-blink-runtime-084c61578262；后续模块原字节不变，aa另有实际讲话。**只覆盖双眼自动眨眼**，单眼组合仍未修。工程看全时段抽帧，不冒充用户连续自然度验收。
5. 工作台重置明确为“重置位置与动作”，仍回默认速度，但保留已选镜头与按钮状态；最终aa真实单次重置侧脸/位置/idle/.85通过。修正原说明错误“眼部尚未接入”，按真实能力显示。UI空格不误暂停已有检查保留。

6. 1fff限定优化：仅克隆实际引用变形/法线邻域的primitive，嘴部9→2；warm按材质/布局版本准备，成功后淘汰同mesh过期材质版本，失败保旧/pending完成清理。60组合、全部引用表达分量及源端点/生命周期技术检查保留。19组真实UI/配方/表情/颜色往返/复位通过，两轮资源计数稳定；这不是长期零泄漏。新增favicon两个入口实际CDP 200。
7. 首嘴改动A→B→A无录制短测：旧315–358ms长帧，新97–103ms；上传32–33MB→7.1–7.4MB。RTX4090/Chrome157/1600×1000/暂停人物隔离成本，非游戏持续帧率或普通机结论。首次新增眼域仍67–73ms，换体成本本次未优化。详evidence/face-selective-cost-comparison-v1。aa真实短后台三例约1.51秒已补验，不外推新版本全后台/长时间挂起；时间循环未修改。

8. a0dd仅在一次prepare事务内按真实BufferAttribute复用不可变快照/摘要/finite结果，每primitive期望身份门保留，独立数据仍全比较。120共享/独立组合全buffer等价、14坏输入与7生命周期通过；19组真实工作台配方/换体/颜色/表情回归通过。源/CPU证据face-prepare-snapshots-v1，正常讲话及同姿抽审face-selective-browser-a0dd7fb7bf4a。
9. 新短测的编译前准备75–90→29–44ms，命令152–163→96–109ms；复位/GC后JS backingStorage增量12.3–12.7→1.4MB。首次完整maxrAF仍103–109ms，不称全部卡顿已修；非VRAM/普通机/长期数据。face-snapshot-comparison-v1保存同测法原始数据。

## 构建与备份

- a0dd由4cb4503精确提交独立检出构建；第二个全新检出npm ci/build后98产物逐字节一致、检出干净：evidence/rebuild-a0dd-4cb4503。根目录python scripts/serve-appearance-workbench.py；按APPEARANCE-WORKBENCH从精确提交构建新目录，禁止改写旧版。
- 男jaw源40文件Git字节准确，evidence/jaw-mouth-source-git-bytes。源提交f2dc6d9已远端核实。本轮备份回执delivery/workbench-backup-bcade.json；a0dd回执delivery/workbench-backup-a0dd.json保留，旧版1fff/aa回执保留；以实际回执核实结果，不凭口头push。供应商真人/FBX等既有ignored文件仍只本机，不声称全部远程备份。
- 5d第一次重建对比失败保留。确认只因冻结后新增一行UI动态选项，旧源隔离重建97产物精确重现5d；不是CRLF或几何差异。证据evidence/workbench-build-drift-5d-aa-v1。以后固定版从确切提交独立检出构建；不能改旧报告标签。

## 剩余边界与接续

- 本次有界技术闭环已完成：分区、配方移交、男女代表外观、一个派生体参数复用。新画风/发型/布局及更大外貌差异仍待用户观看，几何微端点不代表明显自由捏脸。等待产品判断，不扩大连续五官范围、体型库、衣库、M3或服务器。
- 既有嘴眉鼻眼只原男女；男jaw只有单嘴端点。女jaw/waist未获几何参数准入；新发仅原男女。文件是本地制作配方而非稳定主播业务身份或云存档。
- 首改脸准备及数据成本已下降，a0dd首次max帧仍103–109ms；当前a0dd一次无草稿女→男定向实测首draw707.7ms、maxrAF812.9ms；4分钟连续使用首轮switch-edit峰825.1ms。主色首用试验01a未改善整段出帧已撤回，不能重复当未试建议。普通机/长期性能未通过；用户明确无普通机，保缺口。
- 裙装及30秒Rokoko舞按用户决定封板，既有瑕疵保留，禁止再次精修。M1既有观感不外推新外貌/全部组合。当前单人/双实例，不等于产品已定同屏规模或正式直播特写。
- 接续优先工作台实际反馈和当前版本未验证的长时运行/首次换体成本；沿已有素材与控制，不扩参数/衣库。首次渲染峰值仍保留；下一方案须区分GPU出帧与CPU阻塞，禁止重复01a或只看render耗时。新布局/画风仍待用户观看，封板裙舞不重开。


## 本轮候选取舍

- 01a1391b7d32主色逐program首用试验已拒绝发布，源164eaf4由603e483明确撤回，当时公开保持1fff，随后a0dd仅合入快照优化。首次draw CPU时间虽减，但同无输入测量最大rAF115–121ms没有改善；不能把耗时搬走写成修好。证据face-firstuse-comparison-v1/DECISION.md。
- 一次诊断trace记录115ms帧间隔与97ms CrGpuMain WebGL命令处理重叠，该长动画帧无JS脚本/阻塞归因，heartbeat继续；另有64ms源准备任务。只定位GPU进程/浏览器渲染层，未证明具体驱动算法。原始trace/对齐数据见face-frame-gap-trace-01a。
- 被采用的a0dd仅prepare事务内复用同BufferAttribute的只读快照/校验结果，不动GPU或法线公式。9 Face geometry共1position及54/56个morph属性，旧代码重复复制486/504次；实际共享证据face-source-sharing-1fff。其源码、构建、测量与回归均独立于01a。

## 当前工作台持续使用补验

- a0dd实际243.045秒、6轮男女往返/54计时操作，无页面错误或HTTP失败，源几何复位引用一致。后5轮女复位85/44/27（geometry/texture/program），6轮男85/45/26，返回女84/40/24保持；首轮差异另列。无强制GC、无录制，JS数据含QA开销，不代表长期无泄漏或普通电脑。证据evidence/workbench-session-a0dd-v1。
- 同测试switch-edit 15次>50ms，最大825.1ms；讲话窗口max12ms不能覆盖切换长帧。新定向换体command436.4ms、首次绘制707.7ms，14次program infoLog共640.8ms；旧人物dispose1.8ms。同key销毁重建4组仅贡献47.8ms infoLog，不是全部原因。evidence/body-switch-a0dd-diagnostic-v1。
- 该有界试验已形成bcade固定候选并通过后述范围，未扩其他渲染策略。

## bcade换体准备增量（当前公开）

- 仅在换体提交前用Three公开compileAsync准备真实新角色材质，旧角色继续显示。await后先校验请求代数，再重取当前位置/任务/镜头/暂停/服装/诊断模式；不改动作、裙舞、几何配方或颜色算法。22项精确源码CPU检查及独立review通过，evidence/body-switch-compile-v1。
- 真实浏览器：注入compile拒绝保旧、真实重试、等待期间实际移动后改镜头/服装/暂停并采纳最新状态、请求当前体取消旧准备，4组通过。前两次QA错误假设（倍率0.5不支持、90度转向后固定600ms未移动）保留在transactions/r2，最终r3按真实接口与运动条件通过，不算产品修复。
- 同机同法A-B-A原女→原男：maxrAF旧812.9/837.2→新321.6ms，首draw旧707.7/718.3→新322.7ms，命令等待436–472→523ms。旧角色准备期间仍有57次绘制；未将局部render下降冒充全部流畅。program21→23，geometry84/texture41保持；没有完整新program生命周期测试，不称无泄漏。evidence/body-switch-a0dd-diagnostic-v1/COMPARISON.md。
- 新旧两条正常速度UI片都完成女→男→女、镜头/配色保留、三分区。工程检查与用户观感分开；视频含实际加载停顿。源c222404从两个独立检出构建98产物逐字节一致，evidence/rebuild-bcade-c222404。
- 当前剩余：换体仍约0.32秒长帧，改脸a0dd约0.1秒证据仍属原测量；bcade未改该求值但不重标旧测试。普通机无设备、新画风/分区待用户观看。下一项只依据实际用户反馈与明确瓶颈安排，不重启封板裙舞或完整参数库。04分钟会话仅a0dd有证据，不转成bcade长期通过。
