# 73帧左前臂连续swing运输v2

一次授权对照，独立新ID `video-dance-target-v2`，不是完整舞蹈/手掌通过。v1冻结，根/接触问题不在本次修改范围。

以冻结v1精确首帧左前臂local quaternion为起点，后续在**当前父上臂坐标中**，用最短swing将上一帧骨方向运输到当前方向，再乘上一帧local quaternion。实际父级世界旋转照常继承。此规则是未观测twist的一种连续性选择，不是还原真人旋前/旋后；没有固定世界手掌，也没有合成Hands精度。

仅`leftLowerArm.quaternion`数值改变，其余54轨逐项完全一致，包括head/hand/finger中性local轨、hips.position、全部躯干/腿/脚轨。所有73帧times与原138–210 PTS映射不变、首帧quat精确不变、时长3.003秒、整转与横移不变。手与手指的世界朝向/指尖会随前臂变化，这是预期继承，须真实回读。

| 项目 | 女性 | 男性 |
| --- | ---: | ---: |
| 207→208前臂世界旋转v1 | 86.866° | 86.469° |
| 同帧v2世界旋转 | 17.103° | 17.103° |
| 同帧v2 local旋转 | 16.751° | 16.751° |
| 全段v2世界最大步 | 51.166° | 51.119° |
| 全段v2 local最大步 | 56.446° | 56.414° |
| 前臂世界方向与v1最大向量差 | 1.67e−15 | 2.01e−15 |
| 目标骨长最大误差 | 3.33e−16m | 3.89e−16m |

剩余世界最大步在179→180，不能宣称所有突变消失。根/腿/躯干/另一臂世界矩阵对v1最大差仅4.44e−16（浮点重算），左手骨原点差<8e−16m；足底与runtime groundLift风险原样继承。骨方向不变仍不意味着腕掌用途/朝向正确。

`actual-vrm-mixer-check.json`为当前真实F/M VRM、同版loader/rotateVRM0、AnimationClip/Mixer全73帧实际Node回读；raw/normalized原点一致，离线/实际位置误差<1µm。真实游戏1×视觉回读由root独立记录，未在此提前通过。

所有来源/许可/人物与鞋身份沿v1，资产新增`adaptationParentSha256`固定v1文件；`sourceClipSha256`仍指冻结MotionBERT输出。`dance-imports.entry.json`、两个`*-dance-normalized-v2.json`已交root冻结，`*-world-reference.json`/npz和`*-transport-report.json`保完整方向与数值证据。

```powershell
python scripts/video-motion/transport-dance-forearm-v2.py
node scripts/video-motion/check-dance-target-v2-clips.mjs
```

两份候选与entry冻结后不可覆盖已录版本。没有更换模型、阈值、时间、身体、骨长或转身，没有逐帧手捏其他动作。支撑观察在`assets-source/video-dance-twist-study-v1/support-observations.json`，本次未据此修改任何脚部方案。
