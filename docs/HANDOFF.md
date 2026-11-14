# 项目交接

**最新入口：先读 `docs/CURRENT-FOUNDATION.md` 和 `docs/FOUNDATION-MILESTONES.md`。** 当前进入 `feat/avatar-foundation-pipeline`，构建c14a9e3b4083；普通电脑浏览器优先、手机后续。已完成候选人体Blender编辑源重建/再导出、VRM0重定向修复、旧角色独立新增裤装接入；新完整人体与独立裤裙的M1总验收尚未通过，不扩量。原开发工程永久遗失，不得再索取原目录。

下面是前一阶段记录：`fix/avatar-garment-locomotion` 的基线和修复保留，可运行前候选 `b8fea87` 已成功推送到 `origin/recovery/anime-3d-sample`。不要将下面历史的“已通过”扩展到新身体、体型和服装。

最新源码固定构建 **6e6a4fc03f64**，接触/衣物修复里程碑 `9454489` 已远程备份，后续急转修复的提交以本分支HEAD为准。当前可操作入口4180，对照入口4174/output/review；重启固定候选用根目录 `Start-fixed-demo.cmd`（4173）。先读最新修复/验收记录，不从下面历史问题重新开工。保留Phaser＋Three.js＋VRM，Rigby2D不参与。基础模式因原人体胸腹缺面保留覆盖，不能说完整人体已完成。

本轮最终运行结论在 `docs/ACCEPTANCE-2026-11-14.md`，数值、完整录像复核范围和仍未测项目分开记录。后续优先处理动作风格/头发动态与全场景帧耗时、补齐同骨架完整人体，再验证少量体型；不据此批准批量服装。联网仍为后续独立里程碑。

更新：2026-11-14。本记录处于第一轮实施中；最终运行验收由技术负责人更新，不能把下面的“待验证”自动改为完成。

## 目标与权限范围

项目根目录 `F:/gamemake`。用户负责观感与产品选择；技术负责人负责工程实施、排障、集成与实际运行验证。保留 Phaser 经营/UI/场景方向，本轮一个人物、两套外观、完整动作样板，不批量生产。用户最新联网方向是各自经营、排行榜、交易和异步 PK，不要求多人实时同屏。适用约定在根 `AGENTS.md`；A 股项目约定不适用于本目录。

用户已明确长期角色目标：发型、脸型、五官、身材、身高、胖瘦可改；大量服装换装后仍能复用多种动作。当前单人物两服装只是第一道技术样板，不能宣称已完成捏人系统、任意体型或通用服装适配。下一关键验收是**同一件衣服在不同高矮胖瘦体型上，复用同一组走、坐、舞动作**，检查权重、布料轮廓、身体遮挡和穿插；只验证换色或同体型的两套衣服不足以通过。

## 工程状态

- 根 Git 初始提交 `95037ae`。后续集成提交以 `git log -5 --oneline` 实际结果为准。
- 上游 `codeman840425-del/zbgs-test` 固定基线 `92c1ee2b666288526e4ca974187f8b4fc5efb376`，获取时远端 HEAD 相同。
- `baseline/manifest.json` 保存下载文件哈希；`baseline/packs/present_motion_v1_1111_MT/` 不可改写。
- `upstream-tree.json` 保存整个上游树清单。当前只恢复了发布工程材料，没有完整原开发工程。一个旧包 source map 不足以重建指定版本。
- `prototype/` 是新建隔离验证源码工程，不是恢复原工程，不是原人物已修复；正在由前期通用模型排查转为真正二次元 VRM 样板。
- 代表模型已经下载并核验：pixiv 的 **VRM1_Constraint_Twist_Sample**，当前路径 `prototype/public/assets/avatar.vrm`。不要混称为 VirtualCast 的 Seed-san。见 `docs/ASSETS.md` 与 `docs/asset-source.json`。`python scripts/fetch-avatar.py` 固定来源提交与哈希恢复输入。

## 快速恢复顺序

1. 读本文件、`AGENTS.md`、`docs/audit.md`，再读 `docs/qa.md` 的最新实测结论。
2. `git status --short` 保留用户及其他代理修改。检查 `prototype/package.json` 和 lock，勿随意升级依赖。
3. 在 `prototype/` 运行 `npm ci`、`npm run dev`，默认本地入口 `http://127.0.0.1:5173/`。启动前检查端口，复用已有正确服务；不在交接中保存进程标识。
4. `npm run build` 检查可重复构建。依赖存在不等于样机动作已合格。
5. 在根目录可另开 `python -m http.server 8000 --bind 127.0.0.1`，浏览 `http://127.0.0.1:8000/baseline/packs/present_motion_v1_1111_MT/`。这是独立对照站，不是多人服务。

## 已确认事实与计算

`docs/audit.md` 逐项核对用户八条发现，已确认指定包角色走自写 rigid 图片路径，没有该角色的加权网格变形。正式头部仅 se，朝向锁 se，walk_se 与位移独立，疲劳速度降至75%但步频不变。Canvas 帧复制机制确认，静态像素总量不是实测内存。Worker 是 local-sim，IndexedDB 失败实际退到 memory。

执行 `node scripts/audit-transform.mjs` 可复算女坐姿右膝 **16.9323269714 模型单位** 的 S·R/R·S 差异。执行 `python scripts/build-baseline-fix.py` 可生成 `comparison-fixed/` 局部修补副本，严格验证基线 hash 和唯一替换。生成后数学接点差为0，45组旋转/缩放检查通过；不是完整仿射层级、行走或美术修复。

## 同场景对照工具

执行 `python scripts/build-comparison-lab.py` 生成 `comparison-lab/before/` 与 `after/`。两者安装完全相同的测试 hook，只在 after 增加上述局部坐标修补。原包和 comparison-fixed 保持原意。

等待页面 `document.documentElement.dataset.appReady === '1'` 后 `await __lab.room()`，使用同一原房间、同一包内女角，镜头固定且隐藏经营UI。支持 `base('sit_idle'|'sit_down'|'stand_up'|'walk_se')`、`overlay('dance_sweet_loop')`、`walk(x,y,speed)`、`position(x,y)`、`state()`；`__lab.actor()` 是真实角色。完整动作录屏应保存在 `output/playwright/`，记录输入路径、速度、视口和版本。此控制入口只是对照实验条件。

## 现有验证与不足

- 坐标复算、修补生成哈希、45组数学回归、生成包 JS 语法检查已执行。
- 前期 RobotExpressive 主要躯干为刚性网格，仅手部混权，不足证明人物问题解决；Soldier 有真实全身蒙皮，但画风不适合用户目标，改以二次元模型验证。
- 新二次元模型的动作、第二套服装、脚锁、坐姿和性能需以最新 `docs/qa.md` 及完整录屏为准。本交接撰写时尚未看到最终运行验收，不标记通过。
- 用户实际观看后指出程序行走仍像机器人，应优先复用成熟动作。已从 Quaternius 官方免费 Standard 取得 CC0 动作源，43 clips 包含 Walk/Idle/Dance/Sitting Enter/Exit/Idle；`scripts/fetch-animations.py` 固定哈希恢复，分析源 `analysis/assets/UAL1_Standard.glb`。QA 正在进行重定向；不要把“下载了成熟动作”当作已经接入并通过视觉验收。
- 裙装已改 `prototype/src/cloth.js` 的重力布料近似，复用 Three.js r110 MIT 的 Verlet 与距离约束算法，新增腰部固定、腿胶囊、椅面/背碰撞。不是旧的纯骨骼裙。自碰撞、通用衣库和不同体型适配尚未完成；完整循环稳定性待验收。
- 当前保存的 baseline 截图不是“同场景完整前后对比录屏”的替代品。

## 下一步优先级

P0：让同一二次元代表人物原装短裤+真实裙装在样机可切换，验证骨骼权重实际变形，保持自然朝向与距离同步步态。完成左右/前后/斜向、三档速度、起停转角换向、坐下起身与包含抬臂屈肘侧弯抬腿的完整舞蹈；有转身能力则必须录制转身。

P0：主代理运行整段视觉序列与同场景原包前后对照，保存视频、截图及数值。区分浏览器帧间隔、GPU时间、堆内存和资源数量；目标设备未测就明确未测。修复可重现错误后再测受影响路径。

P1：补齐可重复资产获取/生成流程、依赖与模型许可声明、README启动入口，提交清晰 Git 回滚点。UI标注替代角色和隔离样机，不包装为原游戏完成动画替换。

P1：样板过关后建立可调体型与服装适配规范，先验同衣不同高矮胖瘦，再扩大衣库。脸型/五官形变、发型替换、体型参数和骨架尺度需明确版本及兼容范围；不把模型自带少量表情 blendshape 当作完整捏脸。保持动作复用目标，记录需要重新适配的例外。

原开发工程已由用户明确确认因硬盘损坏彻底遗失，不得再次索取路径或等待原工程。依据发布包证据重建可维护源码，缺失的设计与素材如实记录。

P2：完整工程恢复后通过角色表现适配接口逐步替换，保留经营规则与存档语义。真实服务器按各自经营建设：账号、权威存档、结算、排行榜、交易、异步PK和多设备同步均尚未完成；本轮不扩展实时多人同屏。本轮 local-sim 不是联网服务。

## 最终交付需更新本文件

请负责人补充实际采用模型文件名、最终提交、可直接打开的入口、录屏链接、已通过与失败项、资源/性能数据和剩余阻塞。不得仅凭代码或文件存在将样板宣称合格。
