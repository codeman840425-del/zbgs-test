# 新裙样件最小接入约定（只读准备）

范围仅 `experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1` 后续源样件。v1/v2/v3均为冻结失败，v4尚在作者阶段；没有已完成坐姿控制或动态验收。本文不是实施结果，不改人体controller、不建新装备平台、不增加资产。

## 现有真实接线

- equipment.js以装备manifest精确body SHA、GLB bytes/SHA、raw骨名/语义及inverse-bind校验，创建复用人体raw骨的新Skeleton；只挂装备mesh，不挂GLB重复armature。**现loader不支持新私有骨自动通过**，不能伪造既有raw映射。
- m1-equipment.js:54无条件创建createM1Skirt。旧m1-skirt.js:13–33复制geometry、删除skinIndex/skinWeight、建立普通Mesh，隐藏原SkinnedMesh。仅换资源URL仍会走旧guide，不算新路线进入游戏。
- getAssetProfile().skirt目前返回旧corrective.mesh，sourceSkirt另返原weighted mesh。foundation-avatar初始化时记录skirt UUID到meshRoles，手查询回调固定读取此surface集合。
- main每子步：motion.update → avatar.update(live.preUpdate → vrm.update → world matrices → live.postUpdate) → updateGarment → 任务状态。motion最后执行fitSeatHands，腿/骨盆在其之前已完成。
- seatHandSurfaces(false)只读当前引用，不能推进状态。seatHandSurfaces(true)先vrm.humanoid.update、scene.updateMatrixWorld(true)，再equipment.update(0,lastGarmentColliders)，然后fit采实际裙顶点/手骨。它设置garmentPreparedForHands，末尾updateGarment便跳过旧的重复静态裙计算。
- 手fit是live附件层**之前**的校正。持麦/招手可能随后改手，因此最终接触门仍需在controller.simulate整体返回后读取raw皮肤和显示裙面，不能用fit预测指标宣称最终通过。

## 单一最小adapter形状

只在已明确opt-in的新装备ID选此分支；旧裙仍使用原createM1Skirt。接口可保持现有很小形状：`{ mesh/meshes, updatePose(), getInfo(), dispose() }`；不要新增游戏行为状态机。

1. 新分支不调用createM1Skirt、不创建旧guide mesh，最终显示仍为实际加载的SkinnedMesh，保留权重/UV/index/morph。所有显示primitive由getAssetProfile().skirt返回；sourceSkirt仅作源数据角色，不拿隐藏旧面冒充接触面。每个active final mesh UUID加入meshRoles.skirt、assetRole，visible与container一致。
2. pose形状只读实际已经求解的raw hips/腿（或源中明确的局部角度），写**本装备**的morph/专属辅助骨。用确定性当前姿态→权重映射，`dt=0`仍必须产生准确当前姿态；不能依赖只在最终dt>0调用才推进的动作时钟。切装/跳转/中断因此不需另猜时间进度。作者未制作的坐姿shape不得用runtime临时夹腿替代。
3. 必须处理六骨spring所有权。已只读原女性VRM：secondaryAnimation boneGroups[1]精确注册L/R SkirtBack/Front/Side六骨，stiffness=.5、gravity=0；即使gravity0也不是“不更新”。这六骨是raw UpperLeg直接子骨。若预手阶段写它们，稍后的vrm.update仍可能改写，最终显示与手采样不一致。
4. 推荐本装备的最小所有权方案：只为其skin palette建立六个**独有控制骨**（保留同源rest局部/同一inverse-bind，父跟随实际raw UpperLeg；不要新增关节段或完整armature），新裙对应skin index改引用这些控制骨；其余hips/torso等已批准raw骨仍复用。独有骨不加入humanoid/spring注册，只有装备pose adapter写。名称带装备ID以免raw名冲突；此为显式loader本装备分支，不能通过现通用raw bind校验假装已经支持。若源最终完全避开六骨，也可不创建；不要为没用的骨添加运行时结构。
5. 上一条推荐不是已批准实现，更不是必须保留六骨作者方法。若选择仍写共享raw六骨，必须先有该spring组的精确暂停/恢复与单一owner方案，切装/双实例/销毁全部覆盖；不能简单全关spring或每帧末写回后称手表面同步。本轮不推荐扩大到这条所有权机制。

## 必须满足的时序不变量

**手读取之前**：normalized腿/骨盆完成 → humanoid复制raw → mesh/root矩阵刷新 → 本装备pose/morph/私有控制骨求值 → root.updateMatrixWorld(true) → 手surface getVertexPosition取最终候选。静态时同样求值，不靠renderer事后刷新bindMatrixInverse。

**avatar/live/VRM之后**：矩阵同步后，本装备若依赖的raw torso/腿和私有控制骨都未变化，刚才面即是最终显示面；可以沿用prepared标志避免重复。若有写入可能，最小补一个装备自己的finalize/一致性检查阶段，不能未经证明继续沿用旧“只改变arms”的注释。新的显示面若在此改变到手下方，既有手fit不保证通过——必须回到控制/源方案明确两者一致，不加人体controller重跑循环掩盖问题。

推荐的私有六骨方案不会被VRM spring覆盖；live当前只改臂/指/头，源当前裙权重是否确实不含这些骨，须按新GLB实际skin权重确认。不能仅依据bone名字或旧资产推断。多primitive的alpha语义也要检查：现手helper默认mesh.material[0]；新样件若一个geometry含不同alpha材质group，必须拆成正确primitive或明确处理，不能检测错材质。

`seatHandRadii`目前从旧skirtDynamics.thighRadii取值，缺失会让fitSeatHands早退。新adapter应提供真实同身体测量的thighRadii兼容字段（说明是几何尺度，不冒充物理仿真），或局部配置显式保留该测量来源；不得因为不再用guide就静默禁用手层。

## 保持原接口行为

- outfit0裤、1裙、male2短裤的原映射与同步切换；base只隐藏衣物，不删body/上衣内容；鞋始终保持原规则。
- 新裙仅对其精确female body SHA opt-in，不自动用于jaw/waisthip/male。加载失败保持原工厂清理，禁止半个显示体或旧guide回退伪装成功。
- 切入裙时在当前姿态立刻updatePose，包括坐稳/起身/暂停；旧prepared标志不能从上一服装遗留。切离新裙清其局部pose状态，不能改共享身体骨。
- dt0诊断、reset、setDynamics(false/true)、后台恢复、pose refresh均有一致姿态；私有装备pose不应被“关闭动态”停掉，动态开关只管理真正secondary motion。
- adapter/equipment每实例独立，mesh/profile/bone/morph无跨实例共享可变对象。
- 销毁只释放本装备geometry/material/texture/专属Skeleton/控制骨与recipe克隆，不dispose人体raw骨或共享纹理；保持现adapter主体负责的资源不双dispose。清旧原衣物可见性恢复逻辑；取消/失败加载不留下container或spring注册。
- 材质recipe必须作用实际显示网格；若新分支clone材质，应让recipe/还原命中真实mesh，不能只改隐藏source。

## 后续最小运行回归（尚未执行）

1. 同fixed身份记录最终mesh：isSkinnedMesh=true、有多骨权重；旧guide mesh不存在；getAssetProfile.skirt/meshRoles UUID与实际可见mesh完全一致。
2. 实际站→坐入→坐稳→起身→再走，不每段reset；手回调采样与simulate最终显示面的顶点/骨pose标识对齐，最终raw手/body/top/chair门。关/开spring两档，防止后写覆盖。
3. 暂停半坐/坐稳/半起时裤↔新裙↔base即时切换，恢复后继续；坐入/起身中断walk、坐姿招手/卸麦，原幅动作，不缩幅。
4. 最小walk→run→stop/代表舞完整一循环，确认新shape不在非坐姿误触发；旧269同身体同镜头保留。此项未通过不能只靠四静姿准入。
5. 一次双实例加载/切装/销毁和坏SHA拒绝，原body骨姿/其他装备引用不受影响；新衣物pose、手层开销单独短测。仅新裙受影响范围，不重建整套QA平台。

以上是接入约定与待测入口，不是新裙已修复、已支持自然坐姿或性能通过的结论。
