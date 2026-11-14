# 同源裙离线 corrective 首试

状态：**隔离首试失败，尚无可观看合格替代，未改 production 或 ca72 固定产物。** 2026-11-14。

用户指出坐姿裙前摆硬折。已有连续引导和投影位移弯曲两个实验退化，记录在 `M1-SKIRT-OPTIMIZATION.md`。本试验不再向运行时叠加投影，而是尝试把原裙交给已安装 Blender 4.5.9 的原生 Cloth（ANGULAR bending、自碰撞、原生身体/椅碰撞），离线制作同角色坐起形状，再评估小范围姿势 corrective。

## 实际源核查

原 `m1-uniform-skirt.glb` SHA256 `065305626976c59b370d082baa6fd1e2aed8c262490e04e39543345170eb8d8d`：742 个渲染顶点、381 个按位置焊接点、700 三角、单连通片、60 边界边，无非流形边、无退化三角。源骨架有实际裙前/后/侧骨及权重。源褶皱邻面角 P95 为94.08°，最大144.42°；这是原几何褶皱，不能全部归为缺陷。

脚本 `scripts/m1-assets/qa-skirt-corrective-source.py` 已实际运行，生成 `experiments/skirt-offline-corrective/source-audit.json` 和保留 render→weld、每个 UV loop 对应关系的拓扑数据。没有改源 UV、材质或身体。原最短边3.42mm，1080边中5条短于5mm。

## 已执行的有界首试

使用固定构建 `ca72ada827d2` 的同一女性/同一房间/同一控制器，实际采集270帧30Hz坐起输入，含2秒站立预热、坐下/坐稳、起身。输入是离线仿真姿势采样，不是正常速度录像或性能验收。`verifyCandidate` 核对 served/runtime build 以及实际 VRM SHA。

捕获身体、可见衣片、鞋等实际 skinned 顶点与三角，及真实椅 OBB、每帧 hips/root 世界矩阵；没有为了试验删身体面或隐藏内层。保留当时产品的真实装备可见性，不把未知内层虚称存在。Blender 中辅助 collider 的 `hide_render` 只控制离线作者场景，未改游戏可见性。

结果在 `experiments/skirt-offline-corrective/capture-ca72ada827d2/`。首试固定2线程，允许上限180秒，实际6.64秒退出。45帧已保存进度后、60帧开始坐下之前，某条材料边长比超过8而拒绝。前面记录15/30/45帧的最大边比为2.20/2.26/2.36。没有生成 targets、没有制作运行时 adapter，也没有进入产品。

**失败不等同于已看到肉眼爆裂。** 首次 gate 没有保存最坏边ID/实际长度/失败形状，尚不能区分很短源边的局部过伸与明显大形变。已改作者脚本在下一次失败时先保存 `rejected-shape.json`，含实际边长、坐起进度及所有形状顶点；没有为让首试通过而放宽 gate。原 `bake/blender.log`、`bake/progress.json`、`bake/run.json` 保留。后续试验使用独立 trial 目录，拒绝覆盖。

## 下一次的最小步骤与边界

初始条件已有新证据：主代理运行 `diagnose-skirt-cloth-input.py`，在 `capture-ca72ada827d2/initial-contact-diagnosis.json` 记录原始蒙皮裙站立时与身体74对、上衣154对三角相交，非邻接自交0。该物理初始输入不合格，不能靠继续调整 cloth 刚度解决。不能据此将所有数值过伸都归因于初始相交，但必须先消除该阻塞。可复用 Blender 原生 cloth 与 shape keys；本项目只制作导入、采样和导出胶水代码，没有新造一套 cloth solver。

下一隔离方案先诊断产品实际显示的约束后站立裙，不运行 cloth。`capture-skirt-displayed-initial.cjs` 从语义 meshRoles 取真实显示表面，同时保留原始蒙皮表面、同刻所有可见身体/衣物；验证两裙三角和UV完全相同，保存原顶点及hips矩阵、固定身份、截图。随后 `diagnose-skirt-displayed-initial.py` 用同一源焊接映射分别测两表面与所有可见内层的真实三角相交、邻近距离与自交。

**2026-11-14实际已执行：固定 `0df63cf2bdea`，独立标签 `standing-01`。显示初值也失败，没有启动 cloth。** 浏览器捕获4.42秒、2线程Blender原生BVH诊断0.83秒，均已退出；未修改任何产品文件或内层可见性。原始裙同刻与body73对、top154对相交；实际显示裙与body68对、top199对相交；两者非邻接自交均0。73与旧ca72的74是不同捕获姿势的数值，不覆盖旧结果。原拓扑/UV验证完全一致。证据目录 `experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/`，含 `initial.json`、`contact-diagnosis.json`、`contact-regions.json`、站立截图；截图已审看，房间视角不易看到被上衣遮住的内部交叉，不能因外观看不见就接受物理初值。

定位结果：实际显示裙全部68对body相交，涉及20个裙三角（face 0–19）和21个welded顶点。这20面全部共享welded vertex 2，构成横跨腰孔的封口三角扇；中心 hips-local 为 `[0,.134178,-.035273]` 米。受影响点 hips-local Y `.125212–.141245`，world Y `1.039348–1.044163`；21点在原腰pin规则中全部权重1。这不是普通下摆碰撞，直接把显示初值作为rest/pins仍会把封口锁在身体里。优先核实源衣物腰孔应开放并修真实服装拓扑，**不能靠删除身体 collider 或隐藏内层通过**。

上衣材质 `F00_001_01_Tops_01_CLOTH` 对应199对相交涉及137裙面、134点，其中122点pin=0、12点pin=1；受影响hips-local Y `-.027445–.134178`，不仅腰封口，也有上衣下缘/裙层次初值问题。应明确上衣盖在裙外的穿着顺序，整理初值和接触方向后再验，不应直接让cloth猜穿插的哪一侧。`contact-regions.json` 提供实际受影响三角的world/hips-local范围与三角重心；它们不是精确相交线的位置。

只有实际显示初值通过几何检查并视觉确认，才将其用作新 rest/pins 候选：按现有 source render→weld 映射保留UV/材质，以站立hips局部点为rest，腰部pins随捕获hips变换；不把后续旧约束裙全帧再喂为 cloth 形状，以免重新引入硬折。人体、完整可见内层、椅面继续保留原捕获运动作为碰撞。若显示初值仍相交，先报告实际triangle对/位置，不启动第二次cloth或放宽阈值。之后的2线程、180秒上限及小范围坐起/非坐姿边界保持不变。

## 独立源修复进展：未进入产品

已在 `assets-source/m1/offline-corrective/open-waist-v1/` 生成可复建的两件带原绑定GLB；旧裙、旧上衣未改。裙删除确认的腰封口20面，新SHA `a5de096be20211ea9a875434893fff6c9d37b25b58cacc27c9bd8d7b8c772d66`。继续诊断发现上衣下摆也有20面封口，原displayed199对中120对来自上衣封口、9对来自裙封口，余70对是侧面。上衣开孔新SHA `7f266ff135096f16a6db067cceddee0cd610a886833218b1cb6531dd43721c89`。两生成器都实际回读输出，验证幸存POSITION/NORMAL/UV/权重、骨架、材质与领带完全保留；面索引、中心/环坐标在 `edit.json`、`top-edit.json`。

没有把接缝touch算成严重穿模：实际交线17点barycentric UV抽样读取原PNG的alpha，199对都有两材质不透明采样；去裙cap后190对都跨双方平面±>10µm，没有共位边界接缝。交线中位4.45mm、最大29.78mm；长度不是穿入深度，pair数量不是严重度。`layer-alpha-diagnosis.json`记录原件数据。

双cap开孔后保留完整身体/上衣侧面，初形body0/top70/self0。已制作静态离线初形fit：只在上衣覆盖带把裙放入body→skirt→top间，给上衣下摆20mm内搭余量，最大源顶点位移13.493mm。当前纯numpy AABB+实际三角相交线检查为body0/top0/self0，未决共面0；**还没有独立native BVH、最小实际间隙及视觉初形验收，也没有启动cloth。** 生成静态JSON/OBJ不是运行时加权资源，参数/失败版本/验证脚本都保留。不存在新增runtime投影；不是通过减小动作幅度或遮盖/删除身体获得结果。

准备的 `validate-layer-rest-native.py` 只做下一独占窗口的原生BVH及边采样最近距离（明确采样不是全局间隙证明），不运行cloth。上衣/身体之间局部余量小，不能把初形0相交等同能容纳此前3mm+2mm碰撞厚度。须独立确认实际间隙并以一致尺度决定薄衣碰撞，或继续拒绝。静态源开孔与层次fit不能代表坐姿硬折已经修复。

## 原生复核与第二次短试：静态通过、布料拒绝

原生BVH已实际执行：全部保留碰撞表面0相交、自交0。3mm扩张AABB候选后做vertex-face+edge-edge精确最近距离，body最小 **0.4664mm**、top **1.0014mm**；比1mm边采样估值0.5466/1.0046mm更严格。脚本记录实际近邻三角，未将采样估值当全局保证。

Blender 4.5.9 RNA实际检查：cloth `distance_min` 与collider `thickness_outer/inner` 硬下限均1mm作者单位，不能声称设0.2mm成功。隔离短试采用10×作者单位并将重力同乘10，输出还原米；cloth距离0.2mm、collider距离0.1mm的物理尺度能容纳初始真实间隙。保留全部body/实际top侧面和领带；top碰撞代理朝内以表示上衣盖住裙，未删碰撞体。布料参数是技术试验，不是校准过的真实面料。

`standing-open-v1` 原计划最多60帧、2线程、60秒，实际0.84秒因gate退出。frame1无相交；frame2无相交、最大材料边比1.118；frame3（0.0667秒）新增4对body相交：裙face253/494 × body824/826。最大点位移8.823mm，最大边比1.196；top0、自交0。已立即拒绝，没有降低标准续跑。保存 `experiments/skirt-offline-corrective/standing-open-v1/` 的完整三帧、失败形状、坐标区、可编辑 `native-standing-trial.blend` 和日志。

`failure-geometry.png` 是已审看的真实三帧正交几何图，不是游戏效果录屏；未见大爆裂，失败局限在上臀位置。4个相关裙顶点不在pin带；torso径向诊断仍在body外，但三角内部发生交叉，支持粗面跨曲面的碰撞离散问题线索，尚不能单凭该径向指标定论。下一已授权候选仅局部细分仿真网格并回映原render mesh，两种表面都需验，不能用仿真细网格0交叉掩盖原渲染粗面继续穿体。复用现有270帧完整坐起捕获，先核pin轨迹；不新增通用runtime补丁。

## 局部细分拒绝，最后独立规则cage也未通过动态

局部中点细分得到1586点/3072面并保留原render回映。完整270帧源pin轨迹检查先发现过宽固定带8帧穿插；改为真实腰孔固定、25mm测地渐释放后，仍在ca72坐下frame77发现左前臂扫过固定腰圈（实际源骨权重/世界坐标见 `ring-cage-v1/source-arm-blocker.json`）。这是实际动作/服装相容性阻塞，不能由cloth删手臂碰撞体解决。未将整段历史源轨迹称为动态通过。

独立站姿细分短试实际1.15秒退出：第2帧sim与原render均无body/top相交，但最坏0.509mm边伸至1.220mm（2.399倍），材料gate拒绝。最大点位移4.41mm，不能描述为视觉爆裂；未续跑调参。原渲染长瘦三角的简单细分产生18条<1mm短边，未成为合格仿真拓扑。证据 `experiments/skirt-offline-corrective/standing-local-sim-v1/`。

最后有界源替代位于 `assets-source/m1/offline-corrective/ring-cage-v1/`：40角×13环独立cage共520点/480quad，最短边10.22mm，没有亚毫米边。原褶皱render通过三角重心+局部细节offset回映；carrier本身近似RMS3.546mm/max12.522mm，保留detail后静态原点重建<1e-12m。cage与重建render的body/top/self初形三角相交分别全0；native BVH也0，精确近三角距离body0.460291mm/top1.313463mm。原始素材、开孔源、失败数据全部保留。

规则cage唯一一次动态：`python scripts/m1-assets/run-short-cloth.py standing-ring-cage-v1 --ring-cage`，2线程，最多60帧/60秒，实际0.978秒。第3帧（0.066667秒）拒绝：sim与body4对、回映原render与body23对、top0，最大材料边比1.01315、最大点位移9.467mm。前两帧均0交叉。证据 `experiments/skirt-offline-corrective/standing-ring-cage-v1/` 保存全部3帧、失败形状、可编辑blend和日志。不能把减少材料过伸等同解决碰撞，更不能称坐姿硬折已修；本候选没有进入坐下或游戏。

随后只对保存帧执行 `qa-layer-rest-triangles.py --recorded-ring`，没有重跑物理。全三角交线检查独立重现第3帧4/23对body交叉；sim/render全部3帧top0、自交0、未决共面0。原trial完成后才添加render自交在线gate，因此本次render自交结果明确来自 `recorded-surface-check.json`，不倒述为原运行已经检测。规则cage试验到此收敛，不继续参数搜索。

前臂阻塞另有只读量化报告 `M1-SEAT-FOREARM-AUDIT.md`：现控制确有forearm rails，但12mm代理小于真实源前臂P95半径31.39mm，且漏肘后约17mm端部。建议由真实语义skin生成渐变capsule和肘端帽、保留侧向可行路由、最终solve后再核整臂；没有修改motion.js。历史固定腰圈与旧运行时投影裙面不同，不将此离线证据冒充当前产品已重现或已修。

若能产出稳定坐起形状，才创建独立实验 adapter：当前 hips 坐标的离线目标混合，仅约束已经采样的站/半坐/坐/起范围，同角色同镜头比较。记录插值全过程的真实三角/身体/椅/手接触，而不是只看坐稳帧。非坐姿必须另测走/跑/单腿抬起/完整技术舞；坐姿 corrective 不能宣称通用布料或跨动作适配。左右腿非对称及交叉不在首试通过范围，不以降低动作幅度或隐藏内层解决。

持久源配置：`assets-source/m1/offline-corrective/config.json`。脚本：

```powershell
python scripts/m1-assets/qa-skirt-corrective-source.py
# 指定 QA_M1_BUILD 与 QA_M1_ASSET_SHA 后，在独占浏览器窗口：
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/m1-assets/capture-skirt-corrective.cjs
# 下式默认只打印计划。--execute 才启动有界2线程首试；不得与录制/perf并行。
python scripts/m1-assets/run-skirt-corrective-bake.py experiments/skirt-offline-corrective/capture-ca72ada827d2 --trial trial-01
```

本次导出/导入 Blender API 已真实执行至45帧以上；最终保存/目标回读、游戏 adapter、连续视觉验收均未完成。源素材许可与身份边界沿用 `FOUNDATION-ASSET-AUDIT.md`，不因为换用 Blender 就获得新的素材许可。
