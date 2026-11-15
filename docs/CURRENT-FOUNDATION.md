# 当前角色工程

更新：2026-11-14。分支 `feat/m1-foundation-room`。**用户已正式复工，持续实施，不因一项完成而停工。** 当前目标全文 [M1-ACTIVE-OBJECTIVE](M1-ACTIVE-OBJECTIVE-2026-11-14.md)；唯一能力状态 [CAPABILITIES](CAPABILITIES.md)；阶段 [FOUNDATION-MILESTONES](FOUNDATION-MILESTONES.md)。M2/M3、衣库扩量、经营及服务器不展开。

## 最新构建与恢复点

- 本轮接续时主线远程恢复点已核为 `a2f7399a60cc8ec777b1ef2c5bf7ab47649c24fa`（其a1fba5b祖先归档产物）：包含269完整专项/正常片/性能/入口与源重建证据，以及6bc中性人体重复绘制修复与完整专项。公开269的源码仍固定aed9597，二者不混用。
- **公开交互269a73423c97 / 4192**：`experiments/m1-joint-integrated-1/dist`，从aed新检出npm ci/build全部61产物字节一致。手修复同版三体100姿态门、原女post-live259样本、资源隔离/失败重试已验；旧新room/close正常1×影片已归档evidence/hand-joint-269a73423c97。原abdb目录不覆盖，人工观感等待，裙形未过。
- **前一固定abdb18defd26**：`experiments/m1-material-recipe-1/dist`，保留当前招手ready、两派生前臂和可选男短裤材质的基准。其男女各25项整链、两种双实例19任务/peer/本地合同/16生命周期/9场景性能仅证明abdb记录范围，不将版本标签改成269。
- **175集成基准175a487d5ea3**：`experiments/m1-integrated-contact-1/dist`。341运动修复＋c9源坐姿腕目标＋ad0/4ee两轮等价缓存；未替换旧公开交互入口。前臂集成报告：`assets-source/forearm-collision-v2/integrated-175a/RESULT.md`。
- **已接受的限定片段34148e260e6d**：`experiments/turn-candidate-19/dist`。用户接受同镜头1×录像约12–15秒加速与停止，原话“这段可以接受”。只限该片段；不包括其余转向、衣物、男性或175。范围与视频SHA：`evidence/female-acceleration-user-review-341.json`。
- **efdf558930a4旧对照**：`experiments/turn-candidate-17/dist`，已有男性短裤/走跑舞/15转向影片，保留原构建标识；270+35数值矩阵属于更早0df453d35d2c，不改标。
- **4192实际男女入口已核为269**（evidence/current-entry-269a73423c97）；男性选择独立露膝短裤。常驻仅4192演示与4174证据，临时QA服务结束关闭。启动/回滚见CURRENT-DEMO与delivery/candidate.json。
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

- QA：269受影响专项已结束，无后台工具。三体actual/legacy、post-live259、ready/材质/实例/坏配置；room/close两组正常1×；默认动态ON坐稳/切换各30秒已归档，待根负责人统一备份。没有重复未改9场景。原269 source/profile/schema审核仍保留。
- audit：`6bc09ad85c3d` 独立bodydebug修复已真实跑男女两轮切换，实际debug主camera/shadow各2→1，几何/蒙皮/骨姿不变；sameface全图18项最大色道差≤1/255、骨/所有morph/蒙皮逐项一致，首次blink差异失败保留。只隐藏诊断材质的重复outline组，不改穿衣。新fixed在experiments/m1-bodydebug-1/dist；共享源码已有此两行修改且已随a1fba5b备份；6bc仍未发布。另screen描边对照有连续线但新增深边副作用，已冻结，不合主。
- prototype：在codex/simple-skirt-v1隔离worktree持续少褶样件。v1开放截面错误、v2完整截面修正、v3去错误腰半径保持均冻结失败；v4保留原上腰真实120面（四姿body/top0）与权重，只重制下摆并连续缝合。v4站姿body0，但top层序/内折自交/权重4影响剪枝风险仍在，坐姿控制未制作，未准入。v4 fresh-output重生成同SHA cdd2d206…；源checkpoint dd687ca8c3b85bcb2d113121f0e1458094f79d8d已推origin/codex/simple-skirt-v1并核同SHA；112项包核查、v1–v4 fresh GLB一致（历史脚本保留）。正在隔离17034f3fffc1/dist-v4进行GPU诊断，adapter尚不在此源checkpoint内。新adapter必须退出旧guide，显式管理六私有裙骨与原spring所有权，保留真实thighRadii/两primitive最终手查询；须量hand前到最终显示面的差异，不能只看私有骨。详见SKIRT-ADAPTER-CONTRACT。
- 独立审查：SIMPLE-SKIRT-INDEPENDENT-REVIEW未发现v3 LBS/逆绑定错误；CPU最近邻/双面/BLEND阈值图只定位可能外露，不是GPU像素证明。open-top多姿叠图曾复用standing pair，已告制作端在四姿使用前修正；原v3仅standing证据未受影响。
- root：公开269已实际核按钮、身份、资源及观看入口；继续更新CAP/交接、收敛源与真实视觉问题。用户仅接受341约12–15秒片段；已请求269手接触正常片观感，等待期间继续上述独立工作。

所有录像/性能独占，源码/离线准备可并行；固定目录不可覆盖。普通电脑仍缺实机，画风未批准，不展开M2/M3或批量美术。

## 剩余阻塞与交付门槛

M1整体未通过。269已消除所测三体起身掌指交叉，衣物形状与连续观感不因此通过；原裙硬折/裙边、男性短裤局部硬褶及最终材质选择、其他转向/舞蹈自然度仍须按固定片验收。两女性派生保留真实编辑闭环及已测范围，不扩成完整外貌参数系统。

269默认动态ON实际房间单女裙坐稳30秒：帧P95 11.6ms、场景CPU P95 11.4ms，12帧>16.667ms、0>33.34ms，仍高于暂定8ms场景CPU预留目标；坐起切换P95 6.5ms有多状态混合，不冒充纯坐稳。仅Ryzen9950X3D/RTX4090/Chrome157开发机，普通i5-1135G7/IrisXe/16GB/1440×900/60fps参考设备尚无实测。9场景abdb记录保留历史范围，不重标269。

源码aed新检出61产物一致、旧男短裤保存源重导闭环成立。269新QA/影片已随a1fba5b备份；6bc仅debug渲染修复已完成专项，不覆盖已固定269。须继续保存所有源、处理步骤、失败证据、固定构建和远端核验，不能依赖临时output。技术检查、工程抽帧、用户连续观感与目标设备性能分别登记。

男女仍为技术美术候选，正式直播特写、最终画风及房间同屏产品目标未批准；只按单人/双实例报告，不把在线人数当同屏规模。用户判断等待只阻塞对应美术/自然度结论，其余授权任务继续。完成M1后再给M2准入建议，不自动展开M2/M3。

只读成本复盘：HAND-COST-SUBSTEP-REVIEW确认不能跳过中间hand fit或跨子步整解缓存；live/VRM会消费结果。仅同次左右同basis grid复用约0.21ms理论收益，低优先级、不据此启动新优化；真实场景CPU预留缺口继续保留。

## 最新接续增量：17034诊断与分工

- 少褶裙源dd687之后，adapter和失败GPU证据已在独立分支checkpoint `f70c22094a68bb754bc815542e9c4509a3af55a5`；root已ls-remote核同SHA。源码运行改动提交d7ce820，固定17034。没有合入主线/替换公开269。
- root查看实际正站/侧坐原图和完整时段2fps共34帧：上衣下摆露裙片、坐稳前片落腿下明确，非自然度通过。无探针完整片时间比正.99514/侧.99574；重探针片.906/.922另标，保留失败和计时。证据在该worktree的evidence/simple-skirt-v4-17034f3fffc1，已提交远程，不依赖output临时目录。
- prototype继续该装备六私有骨坐姿响应；必要时仅一份保存源的坐姿corrective，不改人体动作/控制器。原120上腰面不动，不把坐姿修正用于掩盖站姿层序。
- audit只读定位后接续独立layer-transition-v1源修复：190非cap top事件全在新下摆前三带，bind/rest就有154，去四影响剪枝仍169，说明不能单独归因权重剪枝；先核body-top夹层，再局部版型/权重过渡，不改变接触门。
- QA在269核出男女眼镜的两镜腿实际穿入太阳穴，镜框/桥无该交叉；进行隔离、分男女的镜腿fit，不重新制作附件类别、不整体外移眼镜。具体最终证据后续归档；当前ACC-01仍未通过。
- root修订AVATAR-CONTRACT真实手拟合→live→VRM→装备更新顺序，并清理阶段计划中已被现证据覆盖的“招手/音频未接入”等过时描述；不新增第二份能力表。
