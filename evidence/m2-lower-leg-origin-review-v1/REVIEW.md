# 小腿比例样件落地原点与重定向复核

复核提交为 `a40403857df58e2b2cff345bd6d2da34b6711111`。root 编写本次 floor placement 与 retarget 变更，本报告由比例源样件作者单独执行实现复核。当前三个 main 游戏加载入口的坐标与装备绑定 CPU 检查通过。持续动作、坐起全过程和视觉验收仍由固定游戏片段确认。

运行时依据 Three.js 187 与 three-vrm 3.5.5。probe 直接使用实际 foundation-avatar、equipment、motion-source 和 createMotion，读取实际 VRM、装备与动作字节。图片解码使用 1×1 fixture，renderer 的 compileAsync 被设为抛错，执行中没有 GPU 编译或浏览器。受审的五个运行源码文件与 a404038 的 Git 文件逐字节匹配，SHA 留在 result.json。

```powershell
node --loader ./evidence/m2-lower-leg-origin-review-v1/json-loader.mjs evidence/m2-lower-leg-origin-review-v1/probe.mjs
```

首次直接 Node 导入因浏览器源码使用无 import attribute 的 JSON import 而失败。附带 json-loader.mjs 只处理 Node 的 JSON 模块读取，随后 probe 通过。该桥接不改坐标、装备或重定向代码。

| 实测项目 | 数值或结果 |
| --- | --- |
| 原男 modelOffsetY | 0 m |
| 原男鞋底最小 Y | 0.000494728272 m |
| 新男撤去放置平移后的鞋底最小 Y | 约 -0.019449775427 m |
| 新男 modelOffsetY | 0.019449776039 m |
| 新男 ground=0 鞋底最小 Y | 0.000000000612 m |
| 新男 ground=1.7 鞋底最小 Y | 1.700000000612 m |
| 100 次 normalized→raw 更新 | 髋无累计位移，raw/normalized 世界位置一致 |
| 不同 actor 位置与 yaw 的全部局部动作轨道最大差 | 0 |
| 显式 actor 地面的新男重定向比率 | 1.121092791152 |
| 原男重定向比率 | 1.099875624630 |
| 新男省略 targetFloorY 时的比率 | 1.099875624630 |
| 一次实际 createMotion idle 更新后的新男鞋底相对 actor 地面 | 约 -0.000064079346 m |

`sourceFloorY` 只在新 VRM 场景创建后、装备加载前使用一次。VRM0 旋转保持 Y 轴。3.5.5 的 normalized→raw 更新把 normalized hips 世界位置转换回 raw hips 父节点局部空间，父级 model offset 因此只作用一次。实际 100 次更新及两套独立装备的鞋底采样支持这一结论。

装备容器挂在同一 vrm.scene 下，使用实际 raw bones 与原始 inverse binds。现有 attached SkinnedMesh 的 mesh world 逆矩阵抵消骨骼矩阵内共同的父级放置变换，最后模型父级把结果放到 actor 地面。实际独立鞋顶点落地检查通过，未发现本变更导致的重复平移。

main 的首次加载、角色交换和 comparison 三处均显式传各自 actor.root 的世界 Y。源码中的 target rest hips 与 targetFloor 均为世界坐标，比例计算结果用于局部 normalized hips 轨道的位移幅度，随后加回局部静止位置。地面 0 与 1.7、不同 XZ 与 yaw 的实际轨道逐值相同。角色替换式创建、拷贝根位置与销毁旧 actor 后，另一个 actor 保持原样。createMotion 的一次实际 idle 更新也保留 modelOffset，两种地面得到相同的相对鞋底值。

保留一个调用边界。`loadRetargetedMotions` 省略 targetFloorY 时沿用 model scene origin，此时派生人物得到原来的身高比例。main 当前三处都传了 actor 地面。旧 `scripts/headless-avatar-node.mjs` 的 loadGeometryAvatar 仍省略该参数和精确 avatarSha256，后续用这个 helper 检查新 body 前应适配它。此次 probe 只复用其 Node 资源适配设置，实际动作调用显式传入精确身份与 actor 地面。

本结论限定单位缩放、当前配置的新鞋源平面和稳定的准备阶段 actor 根变换。两个 actor 的一次 idle 数值以及中性姿态采样不能证明完整动作接触或连续视觉质量。807 基础模式失败、778 实际鞋底失败与 a367 的主线待验状态保留各自原记录，本报告没有替换这些片段的身份。
