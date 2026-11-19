# 双档麦架的签名口眼采样与重放

工作室、出租屋各有 14 个低档样本和 5 个标准档样本。总工游戏实测提供低身体 20 帧、标准身体 6 帧。独立融合验收提供额外 12 帧，覆盖两个房间的首次持有、低身体重开持有和标准身体持有。每个融合阶段各有密网、稀网两次采样。两次有各自的帧号、嘴和眼，所以都保留。6 个密网样本各页有 260 个原观察点，另 6 个样本各页有 9 点。38 帧均来自原持有动作，角色身份和阶段保存在 observations.json。接收方可独立重放设施几何。

## 验证方法

从装有锁定依赖的公司平台源码目录运行。第一条读取可选的上游原件，第二条重现上版失败，第三条验双档四份具名快照。第二及第三条分别使用新的工程内证据目录。示例中的 CANDIDATE 替换为完整公司包或匹配当前源码的 batch 目录。

```powershell
node scripts/company-platform/check-vocal-heights.mjs --verify-source F:/gamemake/evidence/m2-station-lower-game-v1/room-01/report.json F:/gamemake-test/native-studio-round/official-pair/station-lower-c1ae/evidence/primary-01/report.json
node scripts/company-platform/check-vocal-heights.mjs company-workspace/deliveries/vocal-fit-v1 output/vocal-height-profile-v1/replay/signed-old --baseline
node scripts/company-platform/check-vocal-heights.mjs CANDIDATE output/vocal-height-profile-v1/replay/new-candidate --low singing-studio-low singing-rental-low --standard singing-studio singing-rental
```

每组房键依次对应原工作室、出租屋。两档共用原公司与设施/使用点 ID，保留进出与站立本地坐标。脚本读取实际保存、对应布局、在用麦架与谱架、该档口眼合同和安装模型。使用完整公司包时同时校验本次读取的文件及 viewer 实物的签名。batch 使用脚本所在工程的目录表、房间模板与 GLB。通过返回 0；测得任一超限时写 report.json 并返回 1。输入档位、房间身份、源报告或绑定错误在几何结果写出前拒绝。

## 坐标、身份与来源

米制、Y 向上、绕 +Y 的朝向以弧度记，从局部 +Z 转向 +X。mouthM、eyeM、originalSurfaceM 均相对麦架设施原点。分别取受姿态变形的 32 个唇缘顶点中心、同帧实测双眼中心以及原网面首命中。将世界点减设施平移，再绕 Y 反转设施在世界中的 yaw。原出租屋设施位于世界 [−4.5,0,0]，朝向 +π/2；工作室设施位于原点，朝向 0。以各自设施变换重建被测房内坐标，读取原 yaw 减设施 yaw 得到朝向。点保留十位小数；溯源检查使用 0.000002 米容差。每档代表点选自总工已有同一帧的嘴和眼，f06（低）、f24（标准）；工具会逐帧测量所有原点。

| 原件 | SHA-256 |
| --- | --- |
| 总工合并清单 | c1ae6690963ad6291fb60b5d6380f47b06c5373f788c63a2c29330772b462f26 |
| 来源公司交接清单 | 64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc |
| 总工原报告 | bd2ce871255c1b70e8a0abc49b66e7ee9a1f3e6be213e6634ce46eeaefdc9a0f |
| 融合逐帧原报告 | e129b45b79fbb317fd89b3c1c0500349c2dbc50f3dcde543bffd1eb68972618a |
| 融合 results.json | 71d64d0e511a20bf0d89f314eb067becc583a64b23709648efc0b787a46457ae |

observations.json 的 actors 有两个身体、记录和唇缘描述符的完整 SHA-256，rooms 有签名保存与使用点文件的散列。每帧 pointer 定位上游原件的 JSON 字段。fieldsSha256 为未舍入的以下有序数组经 UTF-8 JSON.stringify 后的 SHA-256。

```
[frame, body, record, lipVertexCount,
 contact.lipAnchor.descriptorSha256, contact.usePointId, contact.yaw,
 contact.mouthWorld, contact.eyeWorld, contact.pickupWorld,
 contact.mouthDistance, contact.incidenceDegrees, contact.facingDegrees]
```

## 几何判据与边界

- 从各帧嘴向安装网头几何中心投线，整房首个相交三角须属于指定拾音件。使用首命中测距 0.06–0.26 米、真实轴入射角 ≤35°、站立点水平朝向夹角 ≤45°。低档另须命中面在唇线 ±0.04 米内并低于同帧眼线。标准档另列实际垂直差，同时对照原签名网头、逐帧首命中及距离和夹角。
- 每页实际纸面投射 20×13 个均匀网格中心。各页另在七个横向位置从三角几何提取有笔画的凸起行，对每个实际横截位置逐行检查。分别统计最低网格行、全网格、最低实物谱线、全部实物谱线。每条视线从同帧眼出发，须首命中目标纸面且距目标 ≤0.004 米。页中心读距 0.35–1.8 米，纸面入射角和水平观看角均 ≤60°。
- 从实际外部镜头表面分别连到同帧眼、嘴，检查房内固定物首遮挡，水平及垂直视角各 ≤35° 和 ≤23°。外部镜头是房间里安装的摄像机。角色自身遮挡、动画连续性、屏幕清晰度、游戏取景与声音需在实际游戏另测。
- 原签名包在这 38 帧的每一页均重现 240/260，全 20 个最底网格点被本房谱架面板挡住。38 帧的丢点计数已对照 6 个独立原生密网样本。其他 32 帧的 20×13 密网是本次 CPU 重放的结果。
