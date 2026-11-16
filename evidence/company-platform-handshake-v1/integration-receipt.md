# 公司首包角色接缝集成回执

公司首包已在独立工作树完成源码集成、CPU 核查和构建。副总工可按下列确切源码继续独立构建及原男女四条正常 1× 运行验收。

集成源码提交为 `c4b799d131dcb372ab3a740bff81e817a95ec626`，分支为 `codex/company-platform-handshake-v1`。工作树位于 `F:/gamemake-company-handshake-v1`。

角色基线为 `a40403857df58e2b2cff345bd6d2da34b6711111`。公司实现取自 `a183bd2db7499c0f030178582335caa9a4025a15`，对应集成提交 `a5482bd`。QA 原提交 `ee45569ec5fc34678b7f6aa44b1ff5471b68c9e7` 已合入；最新 `1c3a49c5eec914eff205232f1ffd2f27aeecd642` 只同步了发生变化的 `scripts/company-platform/qa-room.cjs`，对应 `bb24fe8`。该提交的后包文档没有带入。

角色 `main.js` 三处 `loadRetargetedMotions` 调用与 a404 逐行相同，均保留对应角色身份和根节点世界地面 Y。`CharacterScene` 整段、导航转向/阻挡/路径函数、chair collider/refresh/targets/transform 接缝均与 a404 相同。`motion-source.js`、`motion.js`、`seat-lease.js`、`behavior-tasks.js`、`foundation-avatar.js` 和 `foundation-profiles.js` 的 Git blob 均保持 a404 身份。

运行源码变化范围为公司三个配置/构造文件及 `main.js` 的房间接入、配置椅位开场策略、只读诊断，另有本次批准的原男女链接修复。该修复单独提交为 `c4b799d131dcb372ab3a740bff81e817a95ec626`。`bindFoundationControls` 只在当前 `companyLayout` 为 `room-a` 或 `room-b` 时将相同参数附加到原男女链接。空参数、`legacy` 和未知布局维持原 `?body=female`、`?body=male` 链接语义。CPU 执行实际链接构造片段的六类输入均通过。副总工接续检查实际 room-b 点击换男女的页面结果。

最新运行 QA 已核对两项要求。起身完成检查同时要求任务终态为 `completed`；各布局坐稳后的骨盆局部高度与原 4fd 同 body 的坐姿校准结果比较，容差为 15 mm。原版校准段使用暂停的确定性推进；四条正式运行链仍由副总工按正常 1× 录像。

独立 dist 位于 [prototype/dist](/F:/gamemake-company-handshake-v1/prototype/dist)。build ID 为 `86ada889128e`，完整 sourceDigest 为 `86ada889128e2e579b5e2571d19fa5e45e4881822662b391827a028d9b6d8ced`。共 145 个产物文件，排序后文件清单的 SHA256 为 `4457bdb3fe7188d914b19819352bd76a5266b07eab5873bc2df2410af7feac58`。205 个构建输入的实际文件字节全部与集成提交对应 Git blob 一致。

构建使用 Node `v24.13.0`、Vite `7.3.8`。隔离树通过 junction 读取主树现有 node_modules，双方 package-lock 字节一致，SHA256 为 `190e71ef83a8f1d8c94f21caed96b8080bd2e9dcdbcda6bb7b01c5c8fbe5b3a7`。未安装依赖或改锁文件。构建成功，保留 Vite 的大 chunk 提示。

本轮实际完成原公司几何 CPU 复核 17/17，以及集成边界/链接/QA 接缝核查 25/25。原 69 个房间网格、标签绘制命令、材质/变换/阴影、地板射线、障碍、两种椅位和基本坏数据拒绝均通过 CPU 检查。Canvas 替身仅记录绘制命令。

本机详细记录分别为 [集成 CPU 结果](/F:/gamemake-company-handshake-v1/evidence/company-platform-handshake-v1/integration-cpu.json)、[房间 CPU 结果](/F:/gamemake-company-handshake-v1/evidence/company-platform-handshake-v1/room-cpu-report.json) 和 [构建文件清单](/F:/gamemake-company-handshake-v1/evidence/company-platform-handshake-v1/build-receipt.json)。这些本机复核记录保留在独立树中，运行源码提交仍为上述 c4b799d。

副总工可先从 c4b799d 建立自己的独立检出并运行 `npm run build`。预期身份为 86ada889128e。当前产物的运行入口命令如下，输出目录须尚不存在。

```powershell
node F:/gamemake-company-handshake-v1/scripts/company-platform/qa-room.cjs F:/gamemake-company-handshake-v1/prototype/dist 86ada889128e F:/gamemake-company-handshake-v1/evidence/company-runtime-86ada-v1 F:/gamemake/experiments/m2-socks-fixed-v1/prototype/dist
```

副总工负责浏览器实际点击、原男女在 room-a/room-b 的接近、坐稳、起身、离开、正常 1× 画面和受影响路径验收。本轮未启动浏览器、GPU 或新服务。没有普通电脑性能结论。

本回执是本任务对主工作树的唯一写入。公开入口、主树 main.js、角色文档及公司后续功能由各自负责人管理。公司首包完成后的后包安排依双方既有最新授权执行。
