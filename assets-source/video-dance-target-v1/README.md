# 73帧舞蹈目标骨架薄适配候选

2026-11-15。仅原舞片138–210帧，73原PTS、首末3.003秒。实际当前女性/男性各一个固定骨长、既有normalized合同资产。**方向转换与加载机制已跑通，动作、地面接触和twist未通过。** 原MotionBERT输入/两条件、原720帧MediaPipe快照不改，未扩完整30秒、不改runtime。

## 输入输出与身份

源Pexels5359146 / Sergey Makashin及许可沿`evidence/dance-video-pose-v1/source.json`，不是CC0。使用冻结`motionbert-turn-v1/predictions.raw.json`中`swap_172_173_2d`条件；仅身体方向来自该模型，原2D髋用于根的平面位移估计。原素材、模型与工具许可见该证据包，不重新许可角色或鞋。

精确目标为`assets-source/video-target-adaptation-v1/{female,male}-normalized-rig.json`，基于真实原VRM、Three/VRM0旋转和装备鞋导出。每次生成核实际body SHA；目标rig与footwear SHA写入资产。没有改骨、蒙皮、角色身份证或装备。

输出`female-dance-normalized.json` / `male-dance-normalized.json`，格式`normalized-vrm-motion.1`、坐标`three-vrm-3.5.5-normalized-local-absolute`、54骨quaternion+hips.position共55轨；`dance-imports.entry.json`沿既有精确body变体合同。仅hips有position轨，其他骨本地位置永久保目标rest。sourceClipSha是冻结预测JSON的SHA，source与时序在`input-provenance.json`，不可把输入假标为GLB。

原数据时间保持138–210帧，资产时间=source_seconds减首帧，末3.003秒；一次执行后回idle，进入/退出混合沿既有游戏合同，不能把短片录像的idle时长算进原动作。首尾无补姿、无速度改变。

## 一次薄适配的明确假设

1. 模型相机点乘固定`[1,-1,-1]`转右手研究坐标，仅取方向，不把模型归一化输出当米。髋basis取左右髋轴与髋→颈，upperChest取左右肩轴与髋→颈；按目标真实rest basis计算世界delta，再经实际parent逆矩阵转absolute normalized local。身体保整转，未每帧锁面向。
2. 四肢按源上下肢方向逐骨旋转，目标segment长度不变；只解方向，骨轴twist没有实测约束。各帧从固定rest层级和该帧躯干出发，没有逐帧手工修姿、滤波或参数扫描。四元数仅做符号连续化，不改变旋转。
3. 根XY为**原2D髋相对首帧像素位移 × 目标躯干长/整段中位投影躯干像素长**；Z固定原rest未知深度。此估计保横移与画面上下变化，但不是相机标定或真实米制根。女性横移范围76.49mm、男性84.44mm。
4. 只根据第一帧实际鞋skin最低点作一次全段相同放置偏移：女性−48.67mm、男性−53.40mm。没有逐帧抬高、地面夹持、双足常驻锚或接触解算。后续穿地/悬空如实保留，不能为零入地任意修改根。
5. head/neck/hand/fingers保持目标中性**本地**旋转，随animated parent继承，未世界锁定；头proxy不用于头方向。脚/脚趾缺证据，显式使用水平pitch/roll+骨盆yaw随动fallback，无源脚掌转向或落地重建。

`basis-calibration.json`记录固定轴映射、源首帧basis、目标rest basis和VRM0实际hips parent矩阵；`direction-contact-audit.json`附front/+90/back静态数学fixture经parent转换的方向误差。它证明实现的方向约定一致，**不是物理源相机外参标定**，真实人物视觉方向仍要回读。

## 实际数值与保留缺陷

| 项目 | 女性 | 男性 |
| --- | ---: | ---: |
| 固定目标骨长最大误差 | 3.33e−16m | 3.89e−16m |
| 上下肢方向拟合最大残差 | 1.21e−6° | 1.21e−6° |
| 实际VRM/Mixer位置对离线最大误差 | 0.463µm | 0.544µm |
| raw/normalized骨原点最大差 | 0 | 0 |
| 实际髋左右轴展开转角首末差 | 378.87° | 378.87° |
| 鞋skin最低Y | **−64.09mm** | **−70.65mm** |
| 两脚共同最低点的最大Y | **+75.54mm** | **+83.32mm** |
| 任一脚自身最低点最大Y | +179.07mm | +197.19mm |
| 左前臂local最大相邻旋转 | **86.87°** | **86.47°** |

共同最低点>0表示该帧两脚均悬空；单脚离地可以是迈步，不能把两指标混淆。来源只给踝点与方向，不能从本报告推出真实接触。最大左前臂local跳在207→208，左上臂约49.6°在179→180，hips约35.39°在165→166；方向匹配并未保证可靠twist。没有以数值门通过掩盖这些缺陷。

实际查看`target-direction-contact.png`八帧：171–174继续背向、190转回，交叉腿与横向偏移未被固定脚锚抹除；146双脚高于地面线、201附近鞋底深入地面、210再次悬空。骨架图不足以评价完整人物/服装；真实人物原速回读由root独立进行，不能在此提前判通过。

## 验证、复跑与冻结

`actual-vrm-mixer-check.json`为实际加载两个原VRM、VRMLoaderPlugin及同版Three、rotateVRM0、语义骨名映射、AnimationClip.parse/Mixer全73帧回读，未用浏览器/GPU生成源。`*-world-reference.json`/`*-world.npz`保存全部目标骨世界矩阵；`*-frame-audit.json`保存逐帧源帧号与方向残差。初次实现float数组dtype错误在写候选前停止，修正记录`implementation-recovery.json`；不是试调动作参数。

```powershell
python scripts/video-motion/bake-dance-target.py
node scripts/video-motion/check-dance-target-clips.mjs
python scripts/video-motion/analyze-dance-target.py
```

依赖复用本机NumPy/SciPy/Pillow和项目锁定Node库，不新装模型、SMPL或运行时组件。当前两个normalized资产与entry已交root构建并冻结，后续只补报告；若再次生成必须另存版本，不能改写root已录构建的源身份。
