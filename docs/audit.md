# 指定演示包事实核查

核查对象：`92c1ee2b666288526e4ca974187f8b4fc5efb376` 的 `packs/present_motion_v1_1111_MT/`。远端 HEAD 与用户给出的上次检查提交一致。本文件只报告静态代码、数据与计算；视觉运行验收由主任务另存记录。

本地根目录：`baseline/packs/present_motion_v1_1111_MT/`。下文 **主包** 指 `assets/present_motion_v1_1111_MT-DBfKYVCQ.js`，**Worker** 指 `assets/sim_worker_MT-jjM5A5EM.js`。压缩文件不适合以长单行行号定位，提供精确可搜索符号及 UTF-8 解码后的零基字符位置（不是字节偏移）。

## 工程恢复范围

GitHub recursive tree 共 6627 个条目（含目录），见工作区 `upstream-tree.json`。未找到 package.json、AGENTS.md、TypeScript 源码、构建配置、GLB/FBX/Blender 源资产。存在大量静态发布包及一个较旧包的 source map：`packs/v1_lib_expand_E1_hair_patch2_1110_MT/assets/index-CrSpAeTy.js.map`。这个例外不能等同于指定包完整工程已恢复。

清单明确引用但发布树没有的原工程路径包括：`程序/src/v1_rig_preview_MT/config/bones_{f,m}_MT.json`、`tools_MT/vslice_v1b4r6_import_face_v1r3_MT.py`、`美术/face_dir2_pack_1111/v1r3`、`策划/V1_换装分件库实施方案_20261110.md`。应索取包含 `程序/`、`美术/`、`tools_MT/` 的原工程根目录或打包文件，包含依赖锁文件、构建配置和源素材。发布包可用作对照，不是可重复构建的原工程。

## 八项核实

| 项目 | 结论与证据位置 | 影响范围 | 建议 |
|---|---|---|---|
| rigid 分件格式 | **确认**。W1/W3/正式头部清单根键 `partSchema` 都是 `v1.part.rigid.1`。主包 `un`/`dn` 骨架 schema 为 `v1.skel.rigid.1`。`an.rebuildParts()` 对每片 `scene.add.image`。 | 当前身体、服装和头部层均为图片分件；骨骼只是驱动图片的自写层级。 | 保留发布对照，不把这套系统称为 Rigby2D。 |
| 加权网格 | **确认当前角色路径未应用**。主包 `an=class`（1494384）、`rebuildParts()`、`layoutParts()`（1499963）：设置图片位置、旋转、缩放，没有此角色的顶点、骨权重或网格变形步骤。 | 肘膝、肩髋连接依赖叠图；不能通过调一个刚性旋转参数获得连续皮肤形变。 | 选择真实 skinned mesh 或经过运行验证的 2D 加权网格。不能凭依赖或引擎内含 Mesh 类声称已接入。 |
| 方向资源 | **确认，补充 W3 还有 p 视图**。W1 96 项，视图 se/side_r/ne；W3 628 项，se/side_r/ne/p。两者 `viewProjection.note` 明确横向压扁示意；sx 为 1/.42/.78（p=1）。正式头部 `lookpacks/dir2v1r3_1111/parts_manifest_v1.json` 共 46 项且仅 se。 | side_r/ne 不能据此证明存在真正侧身和背面绘制。 | 不将压扁图当正式转身资产。3D 样机验证真实朝向。 |
| 固定朝向与镜像 | **确认**。主包 `Pn`（1640291）构造中 `composer.setFacing('se')`；`walkTo(e,t,n)` 按 `e<this.x` 镜像，播放 `walk_se`；`setLook` 仍用 se。 | 上下、斜向位移均使用同一正偏面步态；左右是整体镜像，不能解决真实转身。 | 按路径切线驱动角色方向，转角保留连续步态。 |
| 位移与步态脱节 | **确认**。`walkTo` 用距离/速度生成 Linear tween；`update(e)` 始终 `player.update(min(.1,e/1000))`。`tired(e)`（1673717）只令 `speedMul=.75`。 | 疲劳位移降至 75%，步频不变；多速度同样缺少落脚距离同步。 | 位移由路径单一负责，步态按实际距离驱动；加减速、停步、急转应纳入状态验收。 |
| 非等比缩放坐标错误 | **确认，复算为 16.9323269714 模型单位**。`zt.recompute()`（1483260 起）对已旋转平移再按世界轴缩放（S·R）；`anchorOf` 和图片旋转缩放相当于 R·S。见下节脚本。 | 非等比缩放与旋转同时出现时，子骨原点和父图片端点不一致。坐姿右大腿到膝关节可重现；不等于每个姿势/每个接缝都偏差 16.93，也不是屏幕像素数。 | 层级统一使用完整仿射矩阵，包含非等比缩放产生的 shear；不要仅对其中一段交换运算顺序就宣称所有层级修复。 |
| Canvas 纹理复制 | **确认复制机制；成本幅度未实测**。`function vt`（1478374）遍历六个图集所有帧，逐帧创建 canvas、drawImage、addCanvas；启动 `Lt.create()` 调用 vt。`Ft`（1481421）还按颜色生成染色 Canvas。 | 静态去重帧 1333，帧矩形 RGBA 总量 54,610,108 字节（约 52.08 MiB），仅为潜在复制像素估算；不含图集、GPU、Canvas 开销及染色变体，不能当实际进程内存。 | 优先直接引用 atlas frame，按需染色并给缓存设容量/释放策略；以实测决定优化，不能仅凭帧数认定帧率不合格。 |
| local-sim 后端 | **确认，且纠正失败回退语义**。主包 `A.kind='local-sim'`，`new Worker`（1697815）；Worker `Je()` 调用 `Ge.open(indexedDB)`，失败后 `new We`，`We.kind='memory'`。`qe.onmessage` 在 Worker 内 `sim.handle(req)` 并 postMessage 响应。 | HTTP 样式路径只是本地请求协议，存档、结算在浏览器内。注释所说 localStorage 回退在这条 Worker 路径并非实际行为：IDB 失败回退内存，刷新后不能保证留存。 | 后续单列账号、服务端权威存档/结算、排行榜、多设备同步里程碑。本轮不能声称联网完成。 |

## 坐姿复算与回归控制

运行：`node scripts/audit-transform.mjs`。脚本只读固定发布包，从实际 `un` 骨架和 `sit_idle.frames[0]` 提取数值，没有手写复制一套期望输入。

- 女骨架 thigh_r restRot=-0.08，坐姿增量=-0.17，总角=-0.25 rad。
- thigh_r sx=1、sy=0.42；shin_r 局部偏移=(0,118)。
- 旧子骨偏移 S·R·(0,118)=(29.1936671920,48.0192996200)。
- 大腿图片端点 R·S·(0,118)=(12.2613402207,48.0192996200)。
- 差值长度=16.9323269714。显示缩放与镜像会改变屏幕量或符号，但不会消除这个局部不一致。

脚本包含定值回归，以及等比缩放/零旋转的对照断言（误差容差 1e-10）。已执行通过。这是错误复现与数学检查，不是已修复原包、也不是视觉验收。

## 临时发布包对照修补

`python scripts/build-baseline-fix.py` 从不可变基线生成 `comparison-fixed/`，入口 `/comparison-fixed/index.html`。生成器先验证主 JS SHA-256=`cd550920c54b1f0d5882af3d090b624e0926ad62843ea6d2ad0bb8327bcab900`，并严格要求旧表达式仅匹配一次，然后只替换 `zt.recompute` 的子骨平移 S·R 为 R·S。其余文件原样复制；原始 baseline 不写入。重复运行得到相同修补 bundle 哈希 `4cad139c7d8a49068d0190cbe848d6876f2e9ab6ce77f9f0a784559771d0bd64`。更换原包版本会拒绝继续。

生成后再次运行 `node scripts/audit-transform.mjs`，脚本直接从生成 bundle 提取修改后的平移表达式执行，右膝端点差降至 0，并通过 45 组旋转与非等比缩放对照。这只是**指定接点坐标问题的发布包临时修补**，不是完整仿射层级修复、不是原工程恢复，也不解决刚性切片、朝向、步频、服装接缝和其他动作。视觉结果仍需比较完整动作，不应因数学检查通过宣称原角色全面修复。

## 可用于原包运行检查的入口

加载页面后全局 `window.__pm` 提供：`scene()`、`actors()`、`trace(index)`、`walkLog()`、`cam()`、`camLog()`、`fx()`、`beats()`、`save()`、`ui()`、`live()`、`pk()`。它们主要是只读观测接口，未直接暴露 actor/game 供任意动作控制。

已有 UI 定位：`[data-testid="title-start"]`、`title-continue`、`title-settings`。`document.documentElement.dataset.appReady === '1'` 表示 title ready。可记录 `actors()` 与 `trace()`，但需实际完整动作视频判断接缝、脚底滑动和跳变。

为同场景录屏另提供 `python scripts/build-comparison-lab.py`，生成 `/comparison-lab/before/index.html` 与 `/comparison-lab/after/index.html`。两个副本安装完全相同的测试控制 hook，输入分别是原包与仅坐标修补包；它们不能冒称未经插桩的发布包。生成时均校验 SHA-256 和三个插入点唯一性。全局 `window.__actorsLive` 注册并释放真实 Pn 角色，`window.__comparisonApp` 暴露 App。控制脚本不调用结算或保存接口。

待 `appReady === '1'` 后运行 `await __lab.room()`，进入原房间并使用同一包内女角，固定镜头、关闭自动巡游、隐藏经营 UI；随后可 `__lab.base('sit_idle')`、`__lab.base('sit_down')`、`__lab.base('stand_up')`、`__lab.overlay('dance_sweet_loop')`、`__lab.walk(900,640,120)`、`__lab.position(400,640)`、`__lab.state()`。此处人为固定房间、角色和镜头是对照实验条件，非游戏功能改造；动作和图片渲染仍走原包实际角色路径。

## 本审计未完成的视觉/性能项目

本文件不把用户报告的“螃蟹感”、腿交叉、接缝严重程度当作已复现视觉结论；需同版本同场景连续录屏。正常侧身行走的腿部遮挡也不应机械判错。GPU 占用、实际堆内存、每帧耗时、真实手机表现均未由本审计测量。主任务样机成功不等同于原角色已修复。
