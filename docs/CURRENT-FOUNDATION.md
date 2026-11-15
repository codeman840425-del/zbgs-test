# 当前角色工程

更新：2026-11-14。分支 `feat/m1-foundation-room`。**用户已正式复工，持续实施，不因一项完成而停工。** 当前目标全文 [M1-ACTIVE-OBJECTIVE](M1-ACTIVE-OBJECTIVE-2026-11-14.md)；唯一能力状态 [CAPABILITIES](CAPABILITIES.md)；阶段 [FOUNDATION-MILESTONES](FOUNDATION-MILESTONES.md)。M2/M3、衣库扩量、经营及服务器不展开。

## 最新构建与恢复点

- 已提交并逐字核实远程：`745e4e931da2b263d97f8f0be3e70848416486b3`，包含abdb运行源码、派生配置、短裤可选材质、音频/生产CLI和已归档证据、17bd裙失败样本。新独立检出npm ci/build产生abdb，58产物逐字节一致（evidence/rebuild-745e4e9）。原1b/175及短裤保存源重导仍保留各自范围。后续a296已归档abdb统一链/可靠性/性能与箱褶失败；新269手候选已局部合入工作区，未发布/未备份，cloth-admission失败源包亦待本次归档。
- **最新集成abdb18defd26**：`experiments/m1-material-recipe-1/dist`，包含49b3两派生真算前臂配置、统一招手ready修复、男短裤可选material recipe。材质两片完整1×已录，四项ready实际回归通过；已完成abdb同镜头男女各25项整链、两种双实例各19任务、peer失败重试、本地2体/26拒绝及16项生命周期（含真实tab）；整片自然度仍待人工验收，recipe仍未持久化。
- **175集成基准175a487d5ea3**：`experiments/m1-integrated-contact-1/dist`。341运动修复＋c9源坐姿腕目标＋ad0/4ee两轮等价缓存；未替换旧公开交互入口。前臂集成报告：`assets-source/forearm-collision-v2/integrated-175a/RESULT.md`。
- **已接受的限定片段34148e260e6d**：`experiments/turn-candidate-19/dist`。用户接受同镜头1×录像约12–15秒加速与停止，原话“这段可以接受”。只限该片段；不包括其余转向、衣物、男性或175。范围与视频SHA：`evidence/female-acceleration-user-review-341.json`。
- **efdf558930a4旧对照**：`experiments/turn-candidate-17/dist`，已有男性短裤/走跑舞/15转向影片，保留原构建标识；270+35数值矩阵属于更早0df453d35d2c，不改标。
- **4192公开交互已更新为abdb18defd26待验候选**，男女实际浏览器入口与服装按钮已核（evidence/current-entry-abdb18defd26）；`?body=male`选择独立露膝短裤。旧942固定目录/影片保留，未覆盖。常驻实查仅4192演示与4174证据；4180/4191/5173当前未监听。启动/回滚见CURRENT-DEMO与delivery/candidate.json。
- 录像主索引：`http://127.0.0.1:4174/evidence/m1-current-review/`；341加速对照：`http://127.0.0.1:4174/evidence/m1-acceleration-efdf-vs-341/`。

## 已确认的修复及严格边界

1. **走跑和停止**：旧efdf真实相位.76–.79出现91–114mm支撑误差，源相位匹配只看位置，未考虑混合期间速度。现在按位置/速度轨迹评分；双脚都不支撑时不再任意延后右脚.24秒。341原14项＋旧女性两退出在原门槛内；正常速旧片峰90.49mm→新片2.01mm。未修改锚点/IK/cap/验收门槛。详见FEMALE-ACCELERATION-REACHABILITY。
2. **前臂接触与成本**：源坐姿腕目标消除旧目标的提前压腿；缓存拓扑和同投影系数，保留每子步实际蒙皮与原接触顺序。175与4ee的270×2真实姿态、约470万字段差0。开发机Chrome157/1440×1080，动态关闭，实际1×坐稳379帧：P50 9.4/P95 11/P99 12.9/max21ms，1帧>16.7ms。仅开发机短测，非普通电脑达标；男性seatHandRadii为空，手接触层未启用，不以加载profile冒充验证。
3. **裙形仍失败**：独立前片候选`17bdb176154c`已与175同参数room/close各录完整1×坐起，真实手层随裙重算；270帧新增6307腰躯干上衣及407手指交叉事件，121帧涉及新增，拒绝合入。原844是旧手姿离线量，已由407闭环量区分。83.286mm是候选与原版同帧形状差，不是单帧突跳；真实30Hz最大点位移46.70→50.78mm。前缘锯齿变横硬片，新增上衣交叉尚不能全部判定外露或有意内层，原门槛不放宽。controls冻结，四片/7姿势可重放输入/SHA见`evidence/skirt-front-17bdb176154c`、`M1-SKIRT-FRONT-CLOSED-LOOP-17bd.md`。
4. **男性短裤**：abdb已通过真正装备API加载recipe，原几何/权重/1024²alpha一致，原材料数组可恢复，两个clone正确dispose；两种材质同room完整1×长短切换/坐起/技术舞已录。前片烘焙硬褶明暗减弱，不修几何。原blend在1b新检出--reuse双导出、回封仍c8a1，实际长短坐起回读通过。用户材质选择正在等待，不阻塞其他工作；当前v2本地记录不支持recipe。
5. **两派生人体**：175两体×B/P/S完整链、18加速停止、12三椅及脸部已采。真实皮肤检测暴露legacy前臂与手；49b3从各自VRM真实重算专属包络，同体开关使前臂53/56失败帧→0。仍各15帧起身掌指交叉。所有身体/服装/SHA与动作时间独立核实，未宣布整体视觉通过。见VARIANT-175-REGRESSION。
6. **M1C连续链**：175女性裙/男性短裤各25项状态检查，不reset/传送；男女与男男各19任务、peer6注入失败/取消/延迟+retry、本地保存2基模/26拒绝通过。abdb撤销Playwright主CDP会话focus覆盖后，真实第二标签页隐藏/恢复7项通过（trusted原生事件、约1.345秒仿真保持、返回不追帧）；原native窗口最小化仍未验，不外推长后台或持续稳定性。证据见NATIVE-BACKGROUND-abdb18defd26。175相机两次0.95缩放来源不明；已真实侧栏/画布输入6项核查，未复现UI误路由。首裙显示renderer88/44→89/45后平台稳定，非无泄漏证明。
7. **生产入口/声音**：scripts/production/flow.py五类只读入口已有10负例回归。男短裤保存源实际重导已完成；材质recipe是数据+allowlist实现，不改人物运动控制器。efdf实际AudioContext小验启动门最大估计偏差13.3ms，非产品音乐系统或扬声器听觉验收。

## 当前分工及下一步

- 最新归档远程已核为 `a2965f9a6d98902209ee517f29ed410ec0c5a36a`；公开4192仍abdb。此前745源码重建结论保留。
- **新独立集成269a73423c97**：`experiments/m1-joint-integrated-1/dist`。在共享abdb上仅合入经独立审查的手关节包络局部补丁、helper及三体各自真实profile。没有拿08隔离工程覆盖main/live/material。三体schema 3正24负通过，实际主线回归进行中，未发布/未宣称手接触通过。
- qa占用浏览器：三体actual/legacy100姿态真皮肤门、招手就绪/卸麦、材质恢复/男性短裤、实例和坏资源；再串行无录制成本及同镜头1×坐起。录制/成本期间不运行Blender、FFmpeg或Git大打包。
- audit：独立核对共享集成及必要旧44/08完整证据归档，不修改runtime。
- prototype：已完成一次cloth-admission源fit，精确间距1.219/1.742/7.819mm未达2/2/8.5mm，停止，没有运行cloth长片。复核恢复包并推荐最多两条不同机制的局部替代，不继续旧参数搜索。
- root：集成、能力状态、源/失败证据归档；保留公共abdb和历史固定版本。手joint尚未有完整主线性能和正常片，不继承44/08局部通过。裙shape仍阻塞，男性/直播/接口已做增量继续保留。

浏览器、录屏、性能串行。固定新build独立outDir，不覆盖prototype/dist或baseline。当前没有购买/换引擎授权需求。

## 剩余阻塞与交付门槛

M1整体未通过。裙硬折/边缘及失败前片、男性短裤材质已有abdb完整动作录像、仍待用户选择；其他转向自然度和同版统一直播/舞/持物/异常链仍待收尾。abdb新检出58文件一致已完成；九场景各30秒无录制实测完成，裙坐稳P95 9.9/P99 11.6/max22.1ms，3/4243帧>16.7ms，其余场景无此长帧，所有场景无>33.34ms；开发机结果和活动占比见CURRENT-PERF-abdb18defd26，CPU预留预算仍未全达。目标普通电脑参考i5-1135G7/IrisXe/16GB/1440×900/60fps，尚无实机；RTX4090结果不外推。男女均技术候选，最终画风/正式直播特写/房间同屏目标仍未确认；只测单人双实例，不从在线人数推导同屏规模。

下一固定交付需同build页面与正常速证据、实际查看入口、能力状态/限制、源重生成与新检出build、远程提交核实。用户等待视觉判断期间继续其他独立任务；不把局部验收扩大为整体通过，不自行停工或扩到M2/M3。

## 重建和源资料

从新检出：`cd prototype` → `npm ci` → `npm run build -- --outDir ../experiments/local-rebuild/dist`。检查：`node scripts/run-fixed-check.cjs <dist> <QA脚本> [参数]`，临时服务随检查结束关闭。745最新已备份提交的新检出已真实完成npm ci/build，58文件与abdb一致；未来改动仍需各自最终复建，不沿用旧证据。

原开发工程永久遗失；prototype是新建可维护工程，baseline不改写。完整生产说明FOUNDATION-WORKFLOW及assets-source。已归档研究HTML49,992bytes、SHA5da0dba12324fdfa4388e0995191427e0b54830c0c18e5fb95701cf688d631db，已在此前远程保存，不重新调研。此前CURRENT现场已存history/CURRENT-before-175-integration-2026-11-14.md，仅作历史证据。
