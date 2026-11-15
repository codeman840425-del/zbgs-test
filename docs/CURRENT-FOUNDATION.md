# 当前角色工程：恢复入口

更新2026-11-15，F:/gamemake，分支feat/m1-foundation-room。先读本页、AGENTS、CAPABILITIES与FOUNDATION-MILESTONES。历史流水已存docs/history，不回退或重复制作。

## 固定入口

- **4196 /?workbench=appearance：aa6fc6159e2d**。目录experiments/m2-appearance-workbench-v19/dist，源码ed9b6318c33c4e06f6ab5607581be46653174258，指针delivery/appearance-workbench.json。真实公开入口检查通过，evidence/current-workbench-aa6fc6159e2d。844/v15保留回滚；中间084/894/5d的证据不改标。
- **4195：77e46efb5441**，用户已限定接受的M1基础，未改。4174提供证据；临时QA端口4277在本次收尾后关闭。其他未知/顾问服务未动。
- Phaser3.90.0 + Three0.187.0 + three-vrm3.5.5；Rigby2D及真实多人服务器不参与当前工程。

## 最新实际成果与证据

1. 男女顶部独立按钮；组内原版/下颌/腰胯样件只列当前性别。页内异步换身体不刷新文档；外观/动作/检查分区，镜头/暂停/停止常驻。两尺寸1280×720、1600×1000的分区与真实文件入口通过；男女新短发及发/眉联色、肤/虹膜/外唇色沿已验范围。仍待用户新外观/分区观感。
2. v4本机草稿新增**下载配方/读取配方**；同原schema、精确base/资源/fit/几何身份。文件不含模型本体/动作/镜头/账号；先选对应基模，不同基模明确拒绝。两份配方各在空白context真实选择文件→下载逐值一致，失败保原与异步取消通过。男女两份实际代表文件在evidence/appearance-recipe-runtime-89480cf8f66c/representative-{female,male}.json；同姿room/近景、两条完整1×UI讲话片均已保存。aa再次回读两代表文件与jaw文件通过；不把颜色当捏脸。
3. 原男女嘴宽±4%，眉位/鼻尖/眼裂宽+1%各一个端点保持。新男性下颌只**嘴宽原位/+4%**，其他眉鼻眼仍未适配；按facial-geometry-profiles.js精确SHA配置、共用求值，2%/负值拒绝。源assets-source/m2-male-jaw-mouth-v1与scripts同名目录，40产物/7依赖，编辑源、fresh重做与原底都保留；不是换SHA复制原嘴配方。28点法线邻域与jaw重叠重新计算，源/运行CPU与原男女12组合逐字节回归见evidence/m2-male-jaw-mouth-runtime-v1。实际最终aa的有限表情同姿、短裤讲话/走停/重置和干净context配方见evidence/m2-male-jaw-mouth-browser-aa6fc6159e2d。未见新增明显唇裂/黑斑，不等于完整M2或任意组合通过。
4. 原源happy与blink叠加闭眼导致中央睫毛隐没，现仅对实际眼部primitive使用已有EYE_Joy补偿，不淡出眉/笑嘴、不改源形态。原男女/5身份CPU与24同姿对、4条完整1×实录在evidence/eye-blink-compatibility-v1、eye-blink-runtime-084c61578262；后续模块原字节不变，aa另有实际讲话。**只覆盖双眼自动眨眼**，单眼组合仍未修。工程看全时段抽帧，不冒充用户连续自然度验收。
5. 工作台重置明确为“重置位置与动作”，仍回默认速度，但保留已选镜头与按钮状态；最终aa真实单次重置侧脸/位置/idle/.85通过。修正原说明错误“眼部尚未接入”，按真实能力显示。UI空格不误暂停已有检查保留。

## 构建与备份

- aa由ed9b631独立检出构建，第二个独立检出97产物逐字节一致：evidence/rebuild-aa6f-ed9b631。启动根目录python scripts/serve-appearance-workbench.py；新检出prototype下npm ci，再npm run build -- --outDir ../experiments/m2-appearance-workbench-v19/dist（目录必须新建）；详APPEARANCE-WORKBENCH。
- 男jaw源40文件Git字节准确，evidence/jaw-mouth-source-git-bytes。源提交f2dc6d9已远端核实。最终统一备份回执delivery/workbench-backup-aa6f.json，核回执而非凭口头push。供应商真人/FBX等既有ignored文件仍只本机，不声称全部远程备份。
- 5d第一次重建对比失败保留。确认只因冻结后新增一行UI动态选项，旧源隔离重建97产物精确重现5d；不是CRLF或几何差异。证据evidence/workbench-build-drift-5d-aa-v1。以后固定版从确切提交独立检出构建；不能改旧报告标签。

## 剩余边界与接续

- 本次有界技术闭环已完成：分区、配方移交、男女代表外观、一个派生体参数复用。新画风/发型/布局及更大外貌差异仍待用户观看，几何微端点不代表明显自由捏脸。等待产品判断，不扩大连续五官范围、体型库、衣库、M3或服务器。
- 既有嘴眉鼻眼只原男女；男jaw只有单嘴端点。女jaw/waist未获几何参数准入；新发仅原男女。文件是本地制作配方而非稳定主播业务身份或云存档。
- 初次几何编辑约315–328ms、换体843.3ms为先前开发机证据；无性能修复结论。既有主program/KHR完成但infoLog阻塞、depth首次draw才link的归因在workbench-cost-profile-1188-v1及workbench-program-identity-1188-v1，不重复盲查。最新短片不是普通电脑/长期性能通过；用户已明确无普通机，保缺口继续。
- 裙装及30秒Rokoko舞按用户决定封板，既有瑕疵保留，禁止再次精修。M1既有观感不外推新外貌/全部组合。当前单人/双实例，不等于产品已定同屏规模或正式直播特写。
- 后续若继续，先根据具体用户反馈做受影响的有限样件；未获样片接受不批量生产。没有正在后台持续运行的制作任务，已保存可恢复源与证据。
