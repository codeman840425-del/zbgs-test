# M1 新人体行走回归：鞋底左右分类

状态：固定候选 `66a09d34d8fe` 已重跑3速度×原地/路径×raw/full矩阵，数值回归通过；完整动作与观感另行验收。失败版 `7127534d2536` 保留，不能混用构建。

## 故障与根因证据

模型实际 SHA-256：`027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，`/assets/foundation/base-female-roundtrip.vrm`。

旧源码 `prototype/src/motion.js` 的 `sameFoot` 用脚踝横向距离 `abs(vertex.local.x - foot.local.x) < 0.07` 选鞋底。新人体双脚站距较近，这个范围会包含对侧鞋内沿。实际统计：左脚候选 357 顶点中 70 顶点属于对侧；右脚 355 中 72 属于对侧。改用实际 humanoid `Foot / Toes / LowerLeg` 左右骨骼权重后，分别选中 287 / 283 个正确顶点。

错误采样使摆动脚“借用”另一支撑脚的低高度，脚锁误认为它一直贴地；脚目标越积越远，下一次重新落地时突然重捕。单独读取 raw VRM foot 的固定 120 Hz 检查确认：旧代码在 0.85 m/s 平移行走中最大帧位移约 0.9286 m，而关闭修正的同源动作是 0.02125 m。失败现场记录在 `output/playwright/m1/7127534d2536/walk/{report,continuity}.json`；诊断原始矩阵在 `output/playwright/m1/7127534d2536/foot-lock-before/matrix.json`。

源采样对照纠正了初期判断：相位约 0.75 时左踝高度约 0.319 m，原混采 toe 高度约 0.003 m；正确左鞋 toe 高度约 0.148 m。不能把混采结果当成源动作摆腿一直贴地的证据。

## 最终修复范围

只改变鞋底顶点的左右归属：从几何横向邻近改为同侧 Foot/Toes/LowerLeg 的归一化骨骼权重（合计超过 0.999）。没有改变路径位移、官方 Root Motion 步长、支撑/释放高度门槛、释放混合时间或动画播放速度。

曾用源踝前后极值推导支撑时相作隔离诊断，但正确分类后，原脚锁逻辑已优于该候选：正常速度平移最大 raw 脚帧位移分别 0.021565 m（原逻辑）和 0.021712 m（时相候选），最大修正约 0.0452 m 和 0.0537 m。因此时相候选已撤销，未进入最终方案。`footLockPolicy: sampled-phase-v1` 不再是实施依赖。

运行时 `motion.getFootLockCalibration()` 提供筛选计数及真正渲染网格的 patch 顶点索引，供独立检查；这不是最终脚锁目标本身的自测。

## 可重复检查

在根目录执行：

```powershell
node scripts/qa-m1-foot-lock.cjs http://127.0.0.1:5173 output/playwright/m1-foot-lock-final
# 固定候选时加第四个参数，强制检查 build.shortId：
node scripts/qa-m1-foot-lock.cjs http://127.0.0.1:PORT output/playwright/m1/BUILD/foot-lock BUILD
```

脚本实际启动 Chrome、加载模型，检查实际资源 SHA；3 种速度 × 原地/平移 × raw/full，每组约 5 周期，固定 120 Hz。raw 为关闭脚 IK 和骨盆修正，同一动作源；full 为产品修正。读取 raw humanoid foot 世界坐标，并独立读取 `SkinnedMesh.getVertexPosition()` 的实际鞋底 patch。实际蒙皮检查必须先 `root.updateMatrixWorld(true)` 再更新 skeleton，匹配 Three 渲染流程；仅 `updateWorldMatrix()` 不会刷新 `SkinnedMesh.bindMatrixInverse`，在平移 root 的测试中会伪造双重位移。

开发结果已在固定66候选复现（单帧位移不等于支撑滑步；摆动脚正常运动也有位移）：

| 速度 m/s | 平移 raw 脚最大帧位移 m | 平移 full 最大帧位移 m | full 真实鞋底最大支撑单帧相对位移 mm | full 最低鞋底 patch 高度 mm |
| --- | --- | --- | --- | --- |
| 0.35 | 0.008764 | 0.008980 | 0.392 | -1.017 |
| 0.85 | 0.021250 | 0.021565 | 0.241 | -0.984 |
| 1.50 | 0.037468 | 0.037956 | 0.369 | -0.928 |

连续单支撑段的实际鞋底最大平面漂移为 3.54 / 3.42 / 3.25 mm；同条件 raw 未修正动作约为 77 mm。原地与平移结果相符，固定完整矩阵在 `output/playwright/m1/66a09d34d8fe/foot-lock/matrix.json`；可版本管理摘要为 `evidence/66a09d34d8fe/foot-lock-summary.json`。

门槛：full 最大脚帧位移不超过同组 raw × 1.35 + 2 mm；真实支撑 patch 单帧位移小于 3 mm；一个连续支撑段平面漂移小于 15 mm；最低 patch 不低于 -6 mm；最大修正小于 0.12 m。失败退出非零。门槛用于拦截回归，不等于艺术效果达标。

## 尚未由本检查证明

- 正常速度完整画面的自然度，需要固定候选录屏人工检查。
- 不同鞋型与高矮胖瘦的自动适配；没有据此批准批量资产。
- 绕障、转身、起停与换装状态链，由独立场景回归检查覆盖。
- 仍观察到约 1 mm 鞋底 patch 低于地面，不宣称零穿透。
- 本固定步长脚本不测 GPU 帧耗时，也不替代实际帧率的动作连续性录像。

## 非原点初始化回归

独立审查确认 `updateWorldMatrix` 不触发AttachedBindMode的`SkinnedMesh.bindMatrixInverse`刷新。构造角色前刚改变根位置时，会让蒙皮采样重复计入根位移。构造器真实皮肤采样前改为 `root.updateMatrixWorld(true)`；不泛改骨骼局部更新。

`node scripts/qa-motion-initial-matrices.mjs` 调用真实createMotion和合成人形/真实Three蒙皮鞋，四组初始位置及60°朝向都得到相同局部鞋底校准。内存恢复旧调用的反例被拒绝。它检查构造器放置不变性，不替代真实VRM重定向与视觉验收。
