# 局部细分仿真候选（未进产品）

原来源和独立开孔/静态fit在 `../open-waist-v1/`。本候选保留其380个原weld节点，新增上部细分节点至1586、3072三角。仅对源上半裙长于18mm的边最多两轮共形中点细分；无平滑改轮廓。`simulation-mesh.json`保存每个新点相对原节点的稀疏重心权重，及原682个UV拆分渲染点回映。原渲染680面仍单独验收，不能因为仿真细网格通过就声称原粗面不穿。

复建：

```powershell
python scripts/m1-assets/prepare-local-cloth-mesh.py
python scripts/m1-assets/prepare-cloth-trajectory.py
```

完整作者轨迹复用已有 `capture-ca72ada827d2` 的270帧：站立2秒、坐下/坐稳4秒、起身3秒。实际VRM SHA和source/collider二进制SHA均检查。新pin目标来自实际原蒙皮源位置加hips坐标下静态fit偏移；不把程序摆腿或新动作虚称捕获。`pin-targets.f32`和`trajectory.json`保存回放输入。旧ca72捕获是历史作者输入，**不是新产品版本验收**。

原按Y≥.09全固定的大带有306点/519面，完整轨迹8帧与body/top相交，失败记录保留在 `source-trajectory-check.full-band.json`。已调整为真实腰孔边界（20原点、40细分边点）全固定，沿网格测地距离25mm平滑释放；不是将整个上臀衣片固定在旧姿势。检查固定点、固定边、固定面，不会因固定面变成0就虚称无冲突。

新版完整270帧native检查初形sim/render均0，仍有 **frame77（坐下进度.404）唯一源约束失败**。bodyfaces3556/3557/3792/3794对应实际左前臂（通过原VRM primitive全索引匹配，再读JOINTS/WEIGHTS，LowerArm约90–98%）；其穿过固定腰环边341–760及343–763，3点在最近表面法线负侧约5.5–9.5mm。不得删除手臂碰撞体、跳过此帧、或把腰环漂移当cloth解决。完整动态cloth暂不能合格运行；需要实际动作源和衣物腰环的相容性修正后重验。

站姿局部细分已独立执行，入口 `python scripts/m1-assets/run-short-cloth.py standing-local-sim-v1 --local-sim`。最多60帧/60秒、2线程，实际1.15秒退出。**第2帧材料边比2.399超1.25而拒绝**；当时sim及回映原render的body/top交叉均0、自交0，但仅2帧绝非持续通过。最坏edge1061–1062从0.509mm伸至1.220mm，最大点位移4.41mm，不能描述为肉眼爆炸。局部中点细分仍继承狭长源面的不良尺度，生成18条<1mm短边；单纯增加点数没有成为合格仿真网格。完整源/失败形状/可编辑blend保留在 `experiments/skirt-offline-corrective/standing-local-sim-v1/`；再次执行需新label，不能覆盖失败。

最后已准备的有限替代为 `../ring-cage-v1/` 独立规则环状网格，与原渲染长瘦三角完全解耦，保留原褶皱细节映射；仅完成静态源检查，未跑动态。坐起源frame77前臂扫腰圈的阻塞仍须真实修正，不能由更换网格宣称解决。后续若仿真cage通过而原render失败，必须实际处理渲染面几何，不能用映射名义遮盖。
