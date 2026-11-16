# 当前角色工程：恢复入口

更新：2026-11-15（最新增量 UTC 16日）。F:/gamemake；分支 feat/m1-foundation-room。先读本页、AGENTS 与唯一能力清单 CAPABILITIES.md。旧流水归档 history/CURRENT-before-visible-ab074.md，不能据旧“下一步”重开封板任务。

## 固定入口

- **4196 /?workbench=appearance：a7efd61c61c8**。源0137d7e94be80bff15ae391f54e3c31a259babeb，experiments/m2-appearance-workbench-v24/dist。只增加法线邻域计算优化，27真实样件全部输出与ab074逐字节一致。指针 delivery/appearance-workbench.json；ab074/v23及bcade/v22可回滚，历史指针在delivery/history/。
- **当前录像：4174/evidence/face-normal-neighborhood-v1/**，新男女1×操作/讲话/眨眼/视线。前次外观与移动修复对照仍为4174/evidence/appearance-repair-ab074/，不将旧片换标新版。
- **4195：77e46efb5441** 仍为用户限定接受的M1基础。4191–4194既有历史服务未动；此次没有新增常驻端口，临时QA服务全退出。
- Phaser3.90.0 + Three0.187.0 + three-vrm3.5.5。Rigby2D、真实多人服务器不参与。普通电脑暂无设备，明确未实测。

## 最新成本增量

- a7efd与ab074实际UI无头Chrome无录像短测：重复改嘴请求女25.2→22.0ms、男26.1→20.8ms；首绘最大帧仍约109ms，女加眼最大帧48.6→54.5ms波动保留，不宣称所有操作变快或首次停顿解决。RTX4090/HeadlessChrome157/1600×1000；脚本名visible不代表有窗口，以上rAF不是实际屏幕呈现或屏幕FPS。证据visible-face-ui-cost-{ab074,a7efd}。
- 法线只计算全部affected点的完整邻面，原累加顺序和精度不改。27例真实全buffer/17合同/独立960函数组/实际10配方门过；表情原片已录，root看完六张末13秒2fps抽帧图，非人类连续验收。详face-normal-neighborhood-v1/RESULT.md。
- 新检出122文件一致，rebuild-face-neighborhood-a7efd。公开入口smoke及最后备份见current-workbench-a7efd61c61c8和delivery/workbench-backup-a7efd.json。

## 前次反馈修复（ab074，证据保留原版本）

1. 复现移动“无响应”：面部近景85%高度的实际点击射线落在房间地板之外，没有walk请求也没有提示；并非所有近景点击都失败，更不是角色位置不更新。房间镜头实际点击可移动。证据 workbench-movement-bcade-diagnosis-v1、workbench-movement-bcade-ray-v1。
2. 顶部“房间移动”及动作页入口；镜头/URL/提示同步。地面误点、拒绝、暂停中选目标、继续、停止、招手中路线拒绝都有反馈；跑步按钮明确只选速度。没有更换路径或动作控制器。最终10项真实浏览器门、旧新同脚本1×及全时段2fps抽审：workbench-movement-final-ab074、workbench-movement-after-ab074。
3. 虹膜v3按实际UV保护遮罩与新中性明暗底图染色，原黑瞳/alpha/独立高光/眼白不变；原色恢复原贴图引用。v2保Hue试验产生荧光亮块，明确失败，未发布。v3及mask/neutral/manifest均固定SHA；源 assets-source/appearance-color-v3 与脚本可重复生成。
4. 原男女新增真实几何离散样件：嘴±12%（原±4%仍原算子）、眉高/半间距各3mm、鼻尖2mm、眼裂宽+5%。可编辑源与导出在对应 mouth-visible-v2/face-*-visible-v2；不等于开放整个区间。男性jaw仍仅原位/+4%，女jaw/waist四域未准入。
5. v5配方保存实际选用recipe身份；旧v1–4保数值/旧SHA，旧palette v1显式迁移至v3并提示。最终10门包含旧2.5%原意、实际文件往返、坏SHA保旧、原贴图恢复、双实例色彩隔离、加载503后重试及jaw拒绝。见 workbench-v5-final-ab074。
6. 最终男女四域正常UI加载/同姿正侧面/半闭全闭/张嘴及1×讲话注视：visible-face-final-ab074。放大同镜头真实UI对照：visible-face-detail-ui-ab074；先前detail-ab074是诊断命令未同步表单标签，保留但不作用户UI证据。
7. 源/运行CPU：旧11端点保留通过，17项最终合同通过；独立解析新四域6组合POSITION零差、NORMAL≤5.69e-14。新10源端点POSITION通过，9个NORMAL过原门；**男嘴−12% Blender NORMAL 1.105666e-5 > 1e-5仍失败**。定位局部小面纳米量级位置导出舍入，未放宽门或叠加补偿。独立review无新增阻断；详 face-visible-runtime-v1/RESULT.md。

## 验收与边界

- 用户只接受既有布局分区和既定M1片段。此前瞳色明确否决；本次新虹膜/几何幅度待用户观看，不写观感已通过。
- 工程检查是完整原片低频时序抽帧及关键姿势细审；不是人类连续自然度验收。开发机Chrome/1600×1000，不外推普通电脑。
- 女性裙与30秒Rokoko舞按用户要求封板，已知瑕疵保留，禁止再次精修。没有修改脸部之外的蒙皮/动画/家具接触。
- 未开放完整捏脸、任意连续参数、男体型、衣库扩量、M3或服务器；新派生不自动继承原人物几何/服装适配。
- 历史首次改脸约0.1秒、换体约0.32秒长帧仍是历史开发机记录，不能重标本版性能通过；本版普通机与长期成本未测。

## 可恢复与备份

- ab074完整备份已核实至ef8c43b。最新a7efd源0137d7e及证据远端回执见delivery/workbench-backup-a7efd.json；两个回执分开，不给旧备份换标签。
- ab074由精确源独立sparse检出npm ci/build；第二新检出122产物逐字节相同、工作树干净：evidence/rebuild-visible-ab074/report.json。
- 运行重建：新检出prototype执行 npm ci、npm run build；产物放新固定目录，核build-info后按指针运行 python scripts/serve-appearance-workbench.py。不要覆盖bcade/v22。
- 新资源验证：node scripts/install-face-visible-workbench.mjs --verify；node scripts/install-facial-palette-v3.mjs --verify。
- 可编辑源保留包：python scripts/mouth-visible-v2/verify-retained.py；三个face-*-visible-v2/manifest.py --verify。实际隔离Git导出221必要文件、缺90可重建输出仍过四包。嘴原full-local manifest保持，精简检出不可用旧full-local冒充通过。
- ignored原始供应商视频/FBX、fresh/raw/repeat重复二进制和dist不承诺远程备份；canonical editable/final、资源recipe、脚本和重建记录已纳入。不得删canonical源。

## 接续：已恢复实施

用户指出此前停工没有依据。上一轮将有界审查结束误判为全部技术工作受阻；此判断撤销，历史 evidence/goal-scope-audit-a7efd/ 保留为当时快照，不是停工依据。人工观感待验、普通电脑缺设备仅限制各自结论，不阻断独立修复。

当前实际工作：

1. 首次改脸约109ms长帧：用固定a7efd首次嘴+12%对照正常阴影与仅诊断冻结shadow pass；保留主色shader条件、完整rAF及GL调用数据。旧主色first-use方案已撤回，不重复。诊断关闭阴影不是产品方案。
2. 男嘴−12%源NORMAL：生产导出规范化与独立参考合同已实际实现，55形态保护域/法线与原底重生成通过；男±12%新合同过原门，旧负reference仍保失败。见 evidence/mouth-quantization-reference-v1/RESULT.md。未改公开配方/保存/几何，未声称新recipe准入；归档与独立审查后继续首绘修复。
3. 只有证据支持的候选才进入源码修复、受影响回归、独立固定构建与备份；4196仍是a7efd，裙装与30秒舞不重开。

长目标工具目前仍返回blocked，现有工具不提供恢复状态操作；这是工具状态限制，不是停止本轮执行的理由。不创建替代目标，不将目标误标完成。继续按当前用户授权实施。

## 上轮有界目标核对的适用范围

六个原工作包的证据核对保存在 evidence/goal-scope-audit-a7efd/independent/RESULT.md。它不表示首绘停顿、源NORMAL失败或人工/设备缺口已解决，也不能推出没有可继续的技术工作。AVATAR-CONTRACT现行v5、CAP DATA-01和README4196主入口的纠正继续有效；现行状态由CAP与delivery维护。
