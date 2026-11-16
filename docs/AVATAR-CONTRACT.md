# 角色资源与行为约定（暂定）

2026-11-16范围更新：完整M2授权见research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt。当前v6实际语义与下文旧证据保持；稳定角色ID、确定性多记录/批处理及游戏消费现在是M2必交接口，尚未实现部分不得称已完成，也不能以“留M3”省略。随机抽取仍后置。完整能力只见CAP末节，技术选择按FOUNDATION-MILESTONES的P0–P6依赖执行。

新增装备候选约定（公开fe5尚无）：equipment-set校验整个最终集合，onePiece占top+bottom，outerwear需声明layerWith精确条目；未声明层间适配拒绝。先完成所需加载，再切可见性，较新意图废旧异步请求。覆盖mask须绑精确body/item/拓扑，多个已验mask取并集而非按穿脱顺序改全局隐藏；准备失败保原，卸除只恢复不再被其他装备覆盖的区域。当前只有合成mask机制/原男女衣物回归证据，真实连体与叠穿样件未通过；衣层遮挡、扩展槽位与新集合保存仍需接续，不冒称完整框架。

8385候选沿既有outfit选择加入配置组合：extraOutfits的index/role在基模内唯一，equipmentRoles明确组合各角色键，bottomRole指定实际裤/短裤/裙表面。旧10套装的键顺序、ID与v6资源语义不变。新资源只追加精确条目，不换旧manifest URL或修改旧条目含义来绕保存校验。房间层尚未接入真实连体接触，因此拒绝其作为bottomRole；底层onePiece规则测试不等于房间已适配。新组合仍须真实源和受影响运行检查后登记，不因配置存在便准入。基础模式切换时装备覆盖、头发可见性、身体材质及actor/main状态需一起成功或保原；接触读取完整身体，不能从隐藏后的渲染面推定实体缺失。

当前能力和验收状态统一见 [CAPABILITIES.md](CAPABILITIES.md)。当前观看主入口为4196外观工作台，精确构建和回滚只查 delivery/appearance-workbench.json；4195保留已获限定接受的M1基础77e46efb5441，指针为 delivery/candidate.json。4174提供证据。以下包含现行实现与未来接口约定；注明未实现的条款不得冒充运行能力。旧构建测试仍只证明各自范围。

外观工作台是独立候选，见delivery/appearance-workbench.json；4195仍为M1对照。工作台男女按钮切换受检基模；未保存时继承兼容颜色并显式回退不兼容装备，有已保存草稿时恢复该基模最终选择。每基模本机草稿不等于两位主播身份。真实主播身份仍按下列分层。旧QA-only avatar-record合同的baked-resource/空parameters证据不能替代新工作台的实际保存检查。

当前固定版fe5（集成源937df9f）的工作台配方`workbench-appearance-recipe-v6`与规则`workbench-appearance-rules-v6`保存精确基模ID/hash、嘴宽值与recipeSHA、眉/鼻/眼样件ID与各自recipeSHA、发型资源SHA/颜色、装备entry/GLB/绑定及规则版本。表达/口型/视线不混入永久容貌。存储槽`zbgs:appearance-draft:v1:<bodyType>`后缀仅地址。读取旧v1时眉鼻眼为none，旧v2保眉且鼻眼none，旧v3保眉鼻且眼none，旧v4保留原四域数值及身份；旧v5保留其有限较大端点；下一次保存写v6，不自动放大原参数。旧schema混带其尚不存在的域、较大新端点或错误recipe身份均拒绝。当前接受的旧palette版本显式迁移至v3并提示“旧配方已使用新版瞳色渲染，颜色选择保持不变”，不承诺旧染色像素外观保持。未知palette版本拒绝。加载失败按现有事务保先前外观；新请求通过每域revision保留最新意图，跨异步操作不是全局原子事务。精确读写条件以`appearance-recipe.js`、`facial-palette-contract.js`为准，旧文件与新记录的验证证据分别保留，不换标签。

有限几何编辑以不可变原底和完整参数向量求值，保留原mesh/骨架/表情绑定，每实例独占可变几何；变形身份另记baseSHA+recipeSHA+参数，不修改原文件SHA冒充新源。单项复位保其他域，全零恢复原几何引用。准入以`facial-geometry-profiles.js`和`facial-geometry-contract.js`的精确身体SHA、样件ID及recipeSHA为准：原男女保留嘴宽[-4%,+4%]旧连续范围，并新增独立±12%端点，±4%至±12%之间未验区间不开放；眉保留1mm端点并新增高度/两侧外移各3mm，鼻保留0.5mm并新增前移2mm，眼裂宽保留+1%并新增+5%。较大端点必须用v5或v6及各自新身份，不能修改旧配方SHA使旧样件冒充新制作。男下颌派生仍只嘴宽0/+4%，不能取中间值或继承其余三域；女下颌/腰胯派生未准入这些参数。上述是已制作与运行准入范围，不等于全部视觉或源精度检查通过；男嘴−12%旧作者导出NORMAL门失败保留；新明确量化的生产参考已过原门，未改旧文件/运行配方身份。新外观待验及准确范围见CAPABILITIES。不宣称完整连续五官支持。无发基底已核真实头皮，头围/眼睑/牙齿/眼球等仍逐种参数准入；改变嘴位置/头围/眼距应另验持麦、发型和眼镜。

0fb原男女Face有单独渲染精简层：完整canonical源几何供原索引/hash/配方求值，渲染几何按确切new→old映射保留被引用顶点。渲染索引与源索引不同，重置恢复该人物最初render geometry引用，卸载时恢复canonical供既有释放流程。原SkinnedMesh首次求包围球使用当时骨姿与canonical几何，保留透明排序语义。派生体未启用此层；资源/配方schema与准入不因精简改变。

工作台换体由 main.js 的 switchFoundationBody 统一处理：离场加载新身体/动作/外观，公开 compileAsync 准备材质，当前460在准备生命周期监听图形上下文失效/恢复，等待和提交前均检查；失效保旧、明确失败、恢复后重试。此保护不物理取消GPU编译，也不为所有前置网络等待新增立即中止。等待后检查请求代数，再读取最新位置、服装、诊断、镜头、暂停和倍率后同步提交。等待期间旧人物仍可用；失败保旧，过时准备释放。提交结束旧动作与任务，坐姿换体回到新身体的椅前站位，不承诺跨骨架保留动作相位。外观草稿恢复由工作台另行执行，不把整个操作说成跨域原子事务。原男女选项独立于组内样件，不能把基模选择等同主播身份。

本轮固定 Phaser 3.90.0、Three.js 0.187.0、three-vrm 3.5.5。Rigby2D不参与。旧VRM1残缺身体仅作历史对照；M1A已接入完整VRM0 Base_Female、独立GLB装备和GLB动作。可编辑blend是从现存资源重建，不是丢失的原工程恢复。

**此规范现在同时面向男女，但仍是暂定规范。** M1A/B/C最小样件（含男女实际接入/隔离、跑步/直播及必要附件动作管线）未通过前，不能宣称通用角色基础已完成。当前男女实际接入、服装与动作状态见CAPABILITIES；M1-ROOM及M1B-CANDIDATE只保留对应历史证据。

## 主播数据分层（约定已确定，完整系统尚未实现）

| 层 | 保存内容 | 修改边界 |
|---|---|---|
| identity | 永久actorId、姓名、身份性别、年龄数值、经营数据引用 | 换装、换脸不改ID或经营数据 |
| body | baseId、资源版本、最终身体参数、适配配置版本 | 不以性别字段直接挑权重/碰撞常量 |
| appearance | 脸型/五官/肤色/眼睛等最终长期容貌参数、外观年龄感 | 不复用blink/happy口型值当捏脸存档 |
| equipment | 款式styleId、fitResourceId、适配版本，发型/发色/服装/鞋/配饰 | 同款男女版属于同款式的不同适配资源 |
| behavior | 动作语义、风格ID、当前状态、表情、视线 | 风格独立配置，不硬绑定身份性别 |
| provenance | 可选生成种子、generatorVersion、manifestVersion、schemaVersion | 最终结果必须另存；不只用种子重跑 |

身体、脸、行为风格可独立管理；年龄数值不直接驱动网格变形。资产ID不复用旧含义，升级采用新版本/显式迁移；缺失版本用同body已验证默认造型回退并记录原因，不能静默换成其他身体或变脸。M1B先本地保存关闭页面重开，M3检查生成集的一致恢复。当前房间还不是主播经营存档系统。

### 发型独立适配身份（fe5）

同款styleId按精确身体SHA选唯一适配。`hairAssetSha256`标模型，`hairFit`另标适配，不能因为共用GLB就互换适配。原发/无发两字段均为null；原男女已发布短发保留`legacy-head-local-v1`及原manifestSHA；male-jaw的同款短发使用`explicit-fit-v1`及id/version/sha256。原男源GLB和作者身体标记不改。

加载先核manifest、fit、GLB的实际字节，再核目标身体、原身体、raw-head-bind-local挂点、变换及独立原发隐藏范围。v6缺适配身份或错误身份拒绝；旧v1–v5仅支持历史原男女隐式适配，不能把jaw记录降为旧格式借相同GLB准入。旧文件带新hairFit字段同样拒绝。配方回退保原实际fit，较新颜色/操作不被旧异步任务覆盖；仍不是所有域的全局原子事务。此项不修改动作控制器，也不代表任意头围或动态长发兼容。


## 装备规范（男女共同约定）

槽位：top/bottom/onePiece/outerwear/footwear/hair/accessory。onePiece占用top+bottom；outerwear只在对应兼容组合声明时叠穿；同槽冲突按明确替换规则，不能仅追加mesh。身体覆盖区是可恢复集合，每次由最终装备重新求并集，基础人体诊断必须保留完整身体。M1A实际只启用top、bottom、footwear，不把约定等同完整叠穿实现。

每个fitResource记录styleId、bodyBaseId、版本/hash、允许体型范围、原骨索引/权重/逆绑定数据、覆盖区、动态/姿态配置、已验动作和许可。当前GLB装载已校验目标VRM hash和逆绑定矩阵；这只是绑定准入，不代替实测动作和接触。

第一批鞋仅平底；鞋跟/厚底须专门脚姿/步态/椅面适配。挂接接口以head、left/rightEar（可由head局部定义）、left/rightHand的语义及局部偏移记录；道具不得依赖某个模型的children序号。麦克风与眼镜已接入live-presentation.js，并按男女实际身体SHA加载独立fit；连续握持/衣物接触仍验收中。桌面其他道具未实现。

## 实例隔离与资源生命周期

每个角色持有自己的VRM骨架、Mixer/动作权重、装备选择、材质可变参数、形态键权重、时间、脚接触锚点及动态历史。允许共享只读几何/纹理/动画源；修改材质前克隆实例，不能改共享资源造成B随A变色。销毁时区分共享引用与独占资源，单角色换装不能dispose另一角色仍使用的纹理。

目前主/对照角色均使用同一CharacterStudio行为实现、各自motion闭包与livePresentation。foundationProfile每次structuredClone，基模/装备/握姿仍严格按SHA匹配；页面控件绑定在main，不由loadFoundationAvatar初始化UI。loadComparison待动作加载、motion.update(0)和附加骨重置完成后才把root加入场景，取消/失败释放未挂入场景的资源。

男女及男男引用/骨架/表情/装备/销毁隔离已有固定构建证据，0df453曾另验延迟加载、取消、503和重试；具体范围见CAPABILITIES，不代表体型操作或任意共享资源已验。当前裤裙预加载、切换同步；麦克风/眼镜的异步请求按slot版本拒绝过期结果。旧本地QA角色记录绑定完整presentationBuild，关页恢复和错误拒绝证据不等同跨版本迁移。工作台另有上述v6制作配方、本机草稿及真实JSON文件导入/导出：保存最终外观与装备精确版本，但不包含经营身份、动作、镜头或模型本体。它不是正式游戏存档UI，也不能与旧QA记录混用。

## 面部能力分类

现有女候选Face的ALL/BRW/EYE/MTH情绪形态用于表情，EYE_Close/L/R用于闭眼，MTH_A/I/U/E/O用于口型；EYE_Iris_Hide/Highlight_Hide/Extra等属于可见性/特殊表情。HA_Fung/Short等牙齿几何变体是可研究的外貌候选，尚未证明可作为完整长期捏脸参数；没有已验证的连续脸宽、鼻型或眼距编辑控制；已有女性jaw离散几何派生风险样件，其范围见RISK-01，不能当成通用捏脸参数库。56个形态键不等于56个容貌参数。逐项名录保存在foundation/rebuild-report.json，男性映射及原男/单一下颌派生的实际闭眼/AA口型已有3016证据，见CAP的RISK-03；其余口型组合和新的几何变化仍须另核。修改容貌后必须重新检查眼皮、眼球、嘴、牙齿、头颈接缝与肤色，不能直接沿用改脸前结果。

2026-11-14扩展：旧角色继续作对照；新Base_Female为独立VRM0资格候选，已有重建blend和再导出文件，不是原.vroid恢复。正式阶段顺序见FOUNDATION-MILESTONES.md，普通电脑浏览器优先。不同VRM版本的本地动画基转换由motion-source.js处理；不因场景朝向已旋转而跳过轨道转换。

## 独立服装接口与兼容范围

- 装备记录稳定ID、版本、槽位、源许可、GLB哈希、目标基础体型SHA、raw骨语义/名字及逆绑定矩阵。历史athletic-bermuda-v1仅适配旧代表体型，当前完整女性和男性采用各自精确SHA绑定的独立装备；男性独立露膝短裤已实际接入，不继承旧版兼容结论。
- equipment.js负责加载、骨架绑定、槽位意图、显示与资源释放；人体运动控制器不因单件服装变更。旧对照的bottoms-overlay保持原义；当前完整人体装备通过各自manifest和互斥bottom槽位管理，不将不同版型宣称为通用男女裤。
- 服装骨架引用已有raw骨，姿势仍由normalized → VRM更新写入。附加裙骨/物理与基础人形骨各自管理。装备切换不重启人体动作；异步旧请求不得覆盖新选择。
- 身体与服装不要求相同网格；体型范围、拟合形态键、遮挡区和特殊动作修正须随资产记录。当前无跨体型范围数据，不以同名骨骼或整体缩放冒充合格。
- 外貌参数与表情分离。候选保留眨眼、5口型、基本表情和眼骨；没有现成身体参数，脸型编辑后表情仍需验收。生成种子、最终参数、装备ID、资产/规则版本的保存方案保留，尚未实施随机生成。

## 坐标与资产

- 世界长度为米，Y朝上。人物和椅子局部正向均为+Z；方向以弧度表示。
- 人体统一使用VRM humanoid语义映射；绑定参考姿态取模型实际rest pose。不能假定每个原始骨骼沿同一局部轴。
- M1A完整女性使用独立上衣、鞋及互斥的及膝裤/裙；保留完整人体。旧 `?legacy` 对照才使用原上衣+短裤+可选蓝裙，不能把两套装备关系混用。没有声称支持任意外套/裙裤叠穿。
- 后续服装必须提供同参考姿态、单位、骨架映射、材质/覆盖区域及源许可。裙摆/头发附加骨骼和动态单独管理，不另造一套人体骨架。
- 当前没有连续身高胖瘦编辑器。女性jaw与waisthip是两个独立几何风险样件，已真实修改、导出与回读，接触/视觉仍分项验收；男性已制作独立下颌派生，男性局部体型尚未制作，具体范围见CAP。M2才扩展有界参数及组合极值，不把单体型或两样件外推为通用换装。

## 单一时钟和更新顺序

038修正：场景setMode只登记动作请求，不在姿态已求值后提前调用rig.setAction重置时钟；下一次rig.update统一消费。显式reset仍保留。否则暂停刷新会用旧输入和新时钟重入动作起点。

1. Phaser帧调度将毫秒转为秒，处理暂停/恢复和倍率，分成不大于1/120秒的模拟子步。
2. 路径控制世界根位移、朝向和速度。走跑源的线性前进分量按原片校准去除，防止重复位移；技术舞按local-displacement策略保留局部髋XYZ与小跳，不将所有舞蹈平移统一删除。脚锁与骨盆修正不直接控制世界路径。
3. 根据实际位移推进步态相位，选择源clip与权重，显式设置action.time。AnimationMixer.update(0)只求当前姿势，不重复推进第二个时钟。
4. 恢复上次源动画姿势，求新源姿势并缓存；对normalized骨骼施加骨盆/腿IK等修正。避免先清bind pose后被Mixer未改变轨道的缓存漏写。
5. motion末尾执行手部拟合：038起已有校准的手/前臂路径覆盖坐姿、站立、行走与舞蹈，未校准路径不假继承；按当前源目标保留每实例/每手避让量，减少时固定60ms连续释放，新增避让仍立即求解。显式reset、关闭修正、表面身份变更清历史；普通dt0暂停刷新从同一预求解种子重算，不衰减/累积。先由seatHandSurfaces(true)同步humanoid与raw矩阵，按本步腿臀求装备面，再读取实际手部包络并修正手臂。这里只证明求解所用表面；最终手和衣物接触必须在整个子步结束后检查。
6. avatar.update(dt)依次执行live.preUpdate、vrm.update、世界矩阵更新和live.postUpdate。直播层可叠加手臂/手指姿态，VRM把normalized同步到raw并推进附加动态；因此不能把手拟合之前的皮肤当成最终显示皮肤。
7. updateGarment复用本子步已准备的装备面，随后渲染。该复用要求装备所依赖的骨骼/形变在后续直播及VRM更新中不改变；新装备必须实际核对这个条件，不能直接继承旧裙标志。历史1a沿用269的源坐姿腕目标与等价缓存；source/UV/index可缓存，每子步实际蒙皮与投影仍更新，不能把静态缓存当动态几何。

官方接口已对照本机安装版本核查：[AnimationMixer的秒制update](https://threejs.org/docs/pages/AnimationMixer.html)、[VRMHumanoid默认同步normalized到raw](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html)。依赖目录的实际3.5.5实现与此一致。

显式重置/传送时才清头发和布料历史；普通移动保留历史。暂停不积累时间；背景返回处理器丢弃首个增量，真实操作系统后台行为仍须实机验证。

## 验证边界

M1A完整穿衣/真实完整人体中性材质、raw/IK/pelvis/full可同刻对照；旧残缺人体的保留覆盖模式另行标注。M1裙是针对该拓扑的姿态引导、边长与碰撞约束，没有通用布料自碰撞或体型自动适配。身体、衣服与家具检测注明网格/顶点/取样范围，数值通过不代替整段视觉验收。

## 饰品、手持物与动作清单（代表样件已接入，扩展仍为约定）

装备槽位、语义挂点与具体fit资源独立。扩展槽位包含headwear/eyewear/earwear/neckwear/wristwear/waistAccessory/handheldLeft/handheldRight；不能把槽位名当真实骨名。每基模提供head、eyesBridge、left/rightEar、neck/chest、left/rightWrist、waist、left/rightGrip的语义→humanoid骨+局部位姿映射。耳部/鼻梁等可由head下局部挂点构成，须按真实基模标定。挂点尺度与参考姿态随fit版本保存。

资源声明 attachmentMode=rigid/skinned/secondary 或组合；刚性附件挂点并不解决围巾蒙皮、帽发碰撞或动态。每fit记录适用bodyBase及参数范围、bind/weights、覆盖集合、互斥槽位、叠穿前提、动态/碰撞配置、已验动作。卸下重新求最终覆盖集合并释放独占对象，不残留旧遮挡。

手持fit另存物件局部gripTransform、左右手映射、手指pose、使用pose、可用动作与限制。ownedItemId（拥有）/equipment assignment（装备）/grip assignment（手持）/scene placement（放置）是不同状态；一个实体的位置归属只能有一个。逻辑装备/卸下要幂等，异步加载按版本与请求代号拒绝过期结果；完整拿起放下动画后续，不能通过造两个mesh假装装备完成。当前麦克风已接入站讲/走路/坐讲；持麦舞蹈及空手招手明确互斥。女jaw/waisthip没有精确握姿profile，装备麦克风必须拒绝，不能套原身体身份。其余物品不自动继承兼容。

动作manifest与源适配配置分别保存；后续资源必须至少声明 actionId/version、sourceAssetHash/sourceClip/sourceRigAdapter、duration、loopMode、enter/exit策略、rootMotionPolicy、nominalSpeed/stride/contactProfile、活动空间与朝向、允许装备/持物/体型、单动作修正文件、音乐时间偏移及验收记录。ID不可复用含义；通用控制器依赖语义及策略而非大量舞蹈名字。源适配配置解决同类问题，特殊修正单独版本化。

支持格式必须按已验路径声明：运行端 motion-source.js 接入固定UAL GLB + rigMap，以及精确身体身份匹配的 normalized-vrm-motion.1（由 normalized-motion.js 校验和构造）。后者已有Rokoko固定30秒FBX离线转换到原男女目标资源的实际流程，不等于通用FBX/BVH/VRMA上传或任意视频自动绑定。该30秒舞原版及唯一优化版按用户决定封存；不得借格式整理再优化。原地和空间位移动作分别声明路径/动画根运动权属；循环和完整编舞分别声明结束/中断。删除未映射root/scale等轨道的行为不能直接推广给位移舞、小跳或任意源骨架。

## 控制通道与业务边界（部分现有，扩展待实现）

当前长行为入口为requestBehavior：walk、idle、turn、sit、stand、dance、greeting；跑步由walk目标与speed设置驱动同一移动控制，不是第二套人物控制器。behavior-tasks分别记录accepted/queued/rejected准入与running/completed/cancelled/failed执行状态；completed/cancelled/failed为最终结果，requestId去重且内容冲突拒绝。讲话、视线、表情、装备及服装使用同实例command通道，装备返回实际applied/cancelled结果，不将即时设置伪装为长任务完成。任务超时使用暂停期间不推进的仿真秒；坐稳完成仍保留座位占用，起身实际离位后释放。调试可暴露原始诊断开关，但未来经营/界面不能各写一套骨骼与位置控制。新请求失效旧token，旧任务结束不得反写新任务状态。

明确通道权属：世界位移由选定root策略唯一负责；身体主动作/局部上身混合先求；足部按步态接触状态修正，跑/舞腾空不强制双足着地；手臂持物/接触只覆盖声明通道；手指pose独立；脸部blink/口型/情绪与长期appearance分别管理；视线最后按头眼限制合成；附加动态只管理附属骨。VRM normalized→raw同步不可覆盖最终修正。M1A手接触需要本步腿臀先同步并求裙，再解手，最终VRM同步完成；不重复推进动画时间。

共同时间约定为秒：sceneSimulationTime用于动作，audioTrackTime及actionAudioOffset独立记录；暂停、恢复、循环需验证差值，不以两个独立累加计时器默认同步。Phaser音频禁用不等于没有音频小验：已有独立AudioContext短节拍的实际播放、offset、暂停恢复、循环和退出证据，范围见CAP的DANCE-05。该QA小验不是产品音乐系统或听觉验收通过。

经营系统掌管任务、收益与PK权威状态；角色系统只显示当前业务状态。未加载角色、动画暂停、帧率下降、取消舞蹈不应直接结算或重算经营收益。未来多人服务另行实现账号、权威存档、结算、排行榜/交易；当前浏览器样板不具有这些能力。

## 展示衍生数据（登记，界面后置）

房间人物、头像、招聘列表、角色详情均引用同一actorId与已保存最终外观。外观/装备/发型变更生成appearanceRevision；静态预览键由actorId、appearanceRevision、assetManifestVersion、renderProfileVersion组成。版本不匹配仅标预览需更新，不能改变身份/重新随机生成。具体预览生成、缓存和页面不在本轮M1实现范围。

基模派生另立bodyAssetId/assetVersion与精确SHA，装备fit明确兼容派生身份；不能绕过校验复用原hash。真实脸/局部体型风险样件在定型前做，结果分别归入CAPABILITIES RISK-01/02，不把表情morph或整体缩放计为外貌几何制作通过。

## 前臂与手部配置的精确适配（1a沿用269实现，证据按版本分开）

foundation-profiles中的forearmCollision明确URL和文件SHA；加载同时验证实际人体SHA，不能把原女性包络套到jaw/waisthip派生。缓存由createMotion每实例创建，姿态相关系数每次实际投影更新。80轮廓轨及alpha采样仅是有限接触近似，不是完整连续碰撞。

默认使用源坐姿腕目标，诊断`handTarget=lap`只供旧目标对照；`forearm=legacy`只供旧接触诊断。jaw/waisthip已从各自实际VRM独立生成专属前臂配置；49b3中的掌指失败是历史证据，不作为269结果。历史固定269a73423c97采用每体实际VRM生成的32语义关节局部包络，通过handSurfaceContact的URL/文件SHA/bodySHA加载；同版三体各100坐起采样、原女性直播叠层后259样本已有专项记录。每手80有限纵轨和端点不是实体/连续碰撞证明，腕边混权不能凭关节包络继承刚体保证，仍按最终实际皮肤与完整画面验收。男性目前seatHandRadii缺失，坐手接触层提前返回；成功加载男性包络不等于男性坐手接触已启用或验收。具体通过范围与未验项只以CAPABILITIES及其269报告为准。

## 可选服装材质配方（abdb候选）

材质配方是严格固定身体/服装/fit/实现SHA的数据，当前只允许男短裤一件候选；默认保持原材质，选择与恢复经同一装备API执行。它不修改网格、权重或原alpha，不视为裤口/裤裆几何修复。当前本地v2角色记录尚不保存配方，因此不能宣称这种选择已支持关闭页面恢复。用户材质方向未确认前不改变默认、不批量扩用。

## 镜腿局部形态适配（13f集成的既有实现，证据按版本分开）

原F/M眼镜在parse并校验完整GLB后，再按精确身体SHA读取固定profile；profile/源附件/POSITION均核身份。两个镜腿各4个横截面只在加载时变形，逐实例clone并原子替换，原镜框/鼻梁/铰链保留。没有新增逐帧求解或更改手、身体控制。

没有精确profile的身体默认明确拒绝并清理；显式glassesFit=legacy只供旧形状诊断，不是兼容降级。当前profile把镜腿支撑目标设为耳外crest，未证明自然佩戴；不得以静态零交叉升级观感。配置来源、版本、生成输入与验证见assets-source/acc01-temple-fit-v1及CAPABILITIES。现本地QA记录以完整presentationBuild固定默认实现，未建设跨版本产品存档迁移；诊断query选择不属于保存合同。

本轮覆盖试验7a86：当前只支持原女原制服上衣的显式中央躯干fit，不等于完整叠穿集合系统。渲染geometry与完整身体接触geometry分开；原坐标、蒙皮、morph与索引保留，base/卸装/销毁恢复原引用。拟扩展碰撞采样必须使用完整身体读取接口，不能把render index中未画的面当作不存在。精确版本/hash、逐face拓扑校验失败即拒绝；派生体和男性不能借用女体mask。动作边界及视觉状态只查CAPABILITIES，不从数据文件存在推定通过。

## 整套造型提交（003固定验证）

同基模v1–v6输入先验证、复制请求值，再准备实际几何/头发/材质/当前装备集合；各域和人物/装备修订号在首次可见写入前确认新鲜度。所有准备成功后在同一同步调用提交，不暂停渲染或隐藏人物。过期准备释放；旧资源清理延至完整提交后，清理失败报告已应用及警告，不能谎称旧造型仍保留。新换人取消旧加载后，旧加载迟到失败也返回取消。

这是现有资源范围的运行事务，不是完整形体fit准入或跨基模整套换人事务。实际证据及未通过范围以CAP CUSTOM-L02为准。
