# 麦克风嘴部锚点与手腕基变换（源测量）

本包只测量当前男女源、验证实际 VRMLoader 的坐标公式；没有修改运行时、握持配置、手指旋转或模型。目标麦克风应位于嘴前偏下并斜指嘴是后续展示候选，不属于本包的视觉验收结论。

复算入口（项目根目录）：

```powershell
python scripts/audit-mic-mouth-anchors.py
node scripts/audit-mic-hand-basis.mjs
```

Python 使用现有 source-grip GLB 读取器和 numpy/scipy；Node 使用 prototype 锁定依赖。均不启动浏览器。`source-anchors.json` 保存实际资源 SHA、唇口顶点 ID、完整原始局部点及麦克风部件边界；`hand-basis-check.json` 保存源脚本/输入/three-vrm-core SHA 与 12 例结果。

## 实际测量

FaceMouth 共有四个焊接边界环。唯一与实际 Face_SKIN 表面重合的 32 点环是唇口接缝，以其质心作中性嘴锚点。没有用眼骨、整嘴腔包围盒或牙齿位置冒充嘴。

| 身体 | rawHead 局部中性嘴锚点（米） | 到实际虹膜最低点的 Y 距离 |
|---|---|---|
| female | `[0.0000000292, -0.000632618, -0.096035246]` | 42.4405 mm |
| male | `[0.0000000183, -0.009576410, -0.092545855]` | 52.0012 mm |

`aa` 变形也实算并另存；中性锚点不是持续逐帧表情拟合结果。邻接皮肤面积加权法线是测量值，受唇部曲面影响，不能直接当审美上合适的麦克风轴向。虹膜距离仅局部眼遮挡参考，并非视角投影遮挡结论。

麦克风主轴为局部 `+Y`，握点原点 `[0,0,0]`。`socket_capsule=[0,0.113,0]` 是网罩中心，几何前极为 `[约0,0.148,约0]`，网罩半径 `[0.026,0.035,0.026]` 米；中部装饰圈实际横向半径最大约 0.026858 米，检查整体包络应包含它。所谓采音端只是几何前极约定，当前模型没有声学采音模拟。

## 保持源握姿的逆变换

全部 Q 为世界四元数，`mount` 是原 `micRawHandLocal`：

```text
QrawTarget = QmicTarget * inverse(Qmount)
QnormalizedTarget = QrawTarget * inverse(QrawRest) * QnormalizedRest
PmicOrigin = PfrontTarget - QmicTarget * (micScale * frontLocal)
PrawWrist = PmicOrigin - QrawTarget * mountPosition
```

最后腕点式以当前骨世界缩放为 1 为前提；非单位缩放应使用完整矩阵处理，未纳入本次样例。设置 normalized 手腕的本地 Q 仍需左乘当前 normalized 父骨世界 Q 的逆。

对真实男女 VRM0 通过锁定的 VRMLoader 载入后，各做 6 组根、脊椎、上臂、前臂和头旋转。实际 raw 手目标角误差最大 `2.98e-8 rad`，原点/逆变换/嘴锚误差最大 `2.23e-16 m`。初始化时将 rawHead 局部锚点经世界变换转入 normalizedHead 局部，再使用当前 normalized 头求世界位置，与更新后 raw 头位置一致，可避免读取上一帧 raw 骨。

这不验证手臂 IK 可达、连续动作、眼镜/面部碰撞或视觉自然度；以上仍需新固定候选实际画面检查。
