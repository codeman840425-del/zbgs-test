# 2026-11-14 步态修复核实记录

本轮只修改 `prototype/src/motion.js`、`motion-source.js` 和相关验证脚本。场景、衣服和 UI 由其他岗位维护。最后动作文件 SHA256（后续仅格式化会改变 hash）：`0D4007A22849349BA4D29729E27B1215A8718F4C8EE5D613D1FBCCD9C018A63D`。正式步行视频对应同一行走实现；之后增加了坐下途中反向起身的状态衔接，未改行走。

## 已确认的原因及修改

1. **不是重定向左右/朝向整体反了。** 源 Quaternius 人体、原始 VRM 重定向和最终 VRM 同相位对照，原始膝屈曲差约 2°，符合两套参考骨架比例/参考姿态差异；原始重定向没有修正后那种长期半蹲。raw 开关关闭全部足部/骨盆修正，实际轨迹与独立 mixer 克隆在浮点误差范围内一致。
2. 原踝锁捕获仍高于最低点约 2.4 cm 的踝，phase≈.999 时把原始 12.14° 膝屈曲改到 42.10°。改为真实鞋底面片支撑并保留脚掌滚动；骨盆和脚一起做地面定标，不能只抬踝缩短腿。
3. 单帧释放锁定后直接返回源轨迹，实测在 phase .107→.110 产生 **41.995 mm 额外踝修正跳变**，对应 rAF 6.1 ms、相位连续。它是姿态/状态跳变，不是那一帧卡顿。抬脚现在把累积修正带入摆腿，跨 0.16 周期平滑衰减；heel→toe 转移保留已校正踝，不直接跳回原始轨迹。
4. 步长必须来自官方 root motion。最初旧踝振幅估计约 1.205 m，中间试验的局部鞋底速度估计 1.773 m 都不是可靠定标。官方 Walk_Loop / Walk_Formal_Loop 均是 **1.2999999523 m / 1.3333333731 s**，本角色比例换算为 **1.2877704568 m/周期**。`scripts/calibrate-root-motion.py` 可离线从官方包复算，未使用猜测步长。
5. 数学足底点贴地不等于鞋子贴地。真实 CPU 变形鞋底检查揭示了假定踝高的悬空，以及固定单一骨坐标对混合权重鞋底的穿地。现在从实际 Shoes 网格、skinWeight 和 normalized 骨骼变换采样鞋底：水平锁跟随固定材料面片，垂直按鞋底最低表面作 1 mm 软最小值。验证仍独立用 Three 的 `SkinnedMesh.getVertexPosition()`，不拿求解目标当实际鞋底。
6. 停止原来直接 `lerp` 两脚到中立位置，独立视觉确认会双脚贴地收拢。现在先落原摆动腿，再用另一腿短抬脚收回，每足 0.24 s、额外抬高 4.5 cm，足旋转连续插值。源 idle 低髋、膝极向、mixer authoredPose 缓存修复保留。
7. 坐下途中要求走开时，反解当前 sitProgress 对应的退出动画时刻，并用 0.16 s 混合旧/新源姿态，避免一请求站起就跳到完整坐姿。椅高、seatApproach 和已确认的坐姿脚位均未改。

## 实际运行证据

- `output/playwright/gait-review/Walk_Loop.webm`：源模型与同一 VRM 并排，顺序正面正常、正面 0.25 倍、侧面正常、侧面 0.25 倍，各连续 3 周期，0.85 m/s。总计四段，不是挑选单张好图。对应逐帧数值在同目录 `Walk_Loop.json`。
- `output/playwright/gait-review-before/`：早期相同 0.85 m/s 源/目标前侧对照；`gait-trace-before-release/` 是中间版本锁释放问题证据，不冒充最初 b8fea87 发布基线。
- `output/playwright/gait-trace/correction-matrix.webm` 和 8 份 JSON：路径/原地 × raw/IK/pelvis/full，每格 3 周期，每个真实 rAF 记录 dt、phase、source time、root、hip 修正、足目标/实际点、支撑点和实际变形鞋底。
- 原地模式是明确的 **treadmill 诊断**：虚拟前进距离由向后运动的支撑面抵消。若 root 固定而世界支撑点也固定，同时强制前进相位，是另一种拉伸腿的物理任务，不能据此判定路径步行。记录中保留 `treadmill` 和 `supportSurfaceDelta`；产品路径运动不启用它。
- `output/playwright/stop-final/three-speed-stop.webm`：三速度普通场景起步和请求停止；同目录有停止连续截图。
- `output/playwright/locomotion.json`：实际 Phaser 路径、减速/换向、三速度数值回归。
- `output/playwright/stop-step-trace.json`：三速度两脚实际离地再落稳；`motion-interruption.json`：四个坐下中断时刻及诊断开关同刻不改时间的回归。

## 定量结果及边界

最终 path/full 的 745 帧、3 周期：

| 指标 | 实际结果 |
|---|---:|
| 额外踝修正单帧最大变化 | 4.272 mm（旧 41.995 mm） |
| 额外踝修正单帧 P99 | 3.961 mm |
| 骨盆修正单帧最大变化 | 1.534 mm |
| 相位推进/跨周期误差 | < 1e-15 |
| 支撑帧占两足总帧比例 | 57.1% |
| 鞋底面片目标残差最大值 | 2.178 mm |
| 连续支撑面片世界位移最大值 | 0.459 mm/帧 |
| CPU 真实鞋底最低高度（支撑段） | -1.585～+0.341 mm |
| CPU 真实最低鞋顶点水平位移最大值 | 7.057 mm（落地首帧） |
| 连续相同支撑段真实鞋顶点最大位移 | 2.959 mm/帧 |
| rAF P99 / 最大值 | 6.2 / 36.5 ms |
| >16.67 / >33.33 ms 帧数 | 1 / 1 |

**不宣称鞋子完全零滑移**：面片、鞋底最低顶点及接触首帧分别报告；混合蒙皮和脚掌滚动会令这些量不同。绝不只改 contact=false 来移除不良样本。连续支撑覆盖由先前漏检 toe 的约 13.5% 增至约 57%，同时检查真实网格高度。

实际 Phaser 三速度结果：

| 速度 m/s | 面片最大残差 mm | 连续支撑最大位移 mm/帧 | 过伸 / 路径碰撞 |
|---|---:|---:|---:|
| 0.45 | 2.180 | 0.485 | 0 / 0 |
| 0.85 | 2.131 | 0.414 | 0 / 0 |
| 1.30 | 2.149 | 0.559 | 0 / 0 |

四个坐下中断时刻为 0.15 / 0.45 / 0.8 / 1.2 秒，切换瞬间髋部跳变 < 9e-9 m，当前坐姿进度连续，均能起身完成；之后源动作衔接期间的速度变化仍要结合最终场景看。四档诊断切换不推进 phase、distance、actionTime。

上述 rAF 数据来自开发机 Chrome 的隔离裤装诊断场景，不是含全部房间和新裙装的最终性能结果，不是 GPU 时间。存在离群帧，不能用平均 FPS 掩盖。目标设备/移动端、弱机、长期内存、GPU 显存仍未测。

## 可复跑命令

```powershell
node scripts/qa-motion.mjs
node scripts/qa-locomotion.cjs http://127.0.0.1:5183
node scripts/qa-gait-trace.cjs
python scripts/analyze-gait-trace.py
python scripts/verify-gait-trace.py
$env:QA_URL='http://127.0.0.1:5183'
node scripts/qa-gait-review.cjs Walk_Loop
node scripts/qa-stop-steps.cjs
node scripts/qa-stop-video.cjs
node scripts/qa-motion-interrupt.cjs
```

5183 是 `output/gait-candidate` 的隔离副本，避免不同岗位编辑导致 HMR 污染录制。恢复时应复制已固定候选或改 `QA_URL`/命令参数指向相同生产候选，不自动用过期副本证明新版本。

## 视觉结论与未完成项

同相位连续图像可确认 source 的抬腿、脚掌滚动和膝弯曲进入 VRM；没有以禁止腿交叉或缩小动作幅度来掩盖问题。Walk_Formal_Loop 也实际比较过，与 Walk_Loop 的腿周期相近，主要是上身风格不同；本轮保留 Walk_Loop，避免把换 clip 名称当修复。

这轮完成了可复现的姿态跳变、步长定标和支撑/停止逻辑修复。**自然程度仍需最终同场景完整视频由独立复核和用户判断**。尤其停止短步是否自然、坐下中断源姿态衔接、最终裙装和头发动态不能由此份裤装数值报告代替。源动作审美风格、替代角色身份及原工程未恢复的事实不变，不能据此批准批量生产。
