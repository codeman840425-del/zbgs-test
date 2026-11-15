# c182 新增左腕跳变量：保留候选，不集成

两次新增位移来自**共用手接触求解器投影量骤降**，不是原腕轨迹、前臂校正、IK clamp 或新的姿势轨。

| 时间 | 原源腕位移 | 投影向量变化 | 实际新腕位移 | palm投影幅度前→后 |
|---|---:|---:|---:|---:|
| 4.700→4.708333s | 6.033 mm | 9.734 mm | 15.048 mm | 11.9009→2.1673 mm |
| 4.741667→4.750s | 7.022 mm | 6.961 mm | 13.488 mm | 6.9615→0 mm |

实际逐轴 `sourceDelta + projectionDelta = newWristDelta` 残差均为0。原版 raw 腕与候选记录的 authoredWrist 差最多 `8.9e-16 m`，排除了版本间源腕姿态变化。前臂投影均0、clamped=false、首轮alphaRejected均0；此次不是材质alpha边界造成的切换。

第一处最强 witness 从三角顶点 `[22,25,26]`、rail 参数 at=.015691 改为 `[373,376,374]`、at=0。真实源中22=373、26=376，这两面共享同一条几何边，并非凭ID猜测两个不相关面。第二处则从最强 witness `[22,25,26]`、at=0，下一步变成没有正值 witness，校正立即归零。

当前 `railClearance` 对各有限 rail 的投影裁剪区间、五个采样和depth门求最大正值；`measureArm` 再对所有rail取最大值，直接把本步结果加入腕target，无跨步接触保持。**已证实的直接原因**是这个有效最大投影在邻步切换/消失，新增作用范围把这种既有solver不连续带入walk。不是“右腕旧34mm内跳已修，所以整体连续”的结论。

**后续最短反证已补齐**：精确二次寻路正常1×已录，真实时钟仍出现投影撤销；646诊断880条rail的grid与暴力全680面严格相同。rail89/94在对应时刻退出相邻两面的投影区间，非alpha或空间索引漏选。详细记录、同rail拒绝原因、影片时钟和连续帧限制见 `EXACT-TRANSITION-RESULT.md`。候选仍保留不集成；局部连续帧不等于正常速观感接受。

离线源/修正分解复跑：`python experiments/hand-scope-worktree-1/decompose-snap.py`。最新归档：`python experiments/hand-scope-worktree-1/archive-snap.py` 后运行 `compare.py` 更新哈希清单。未修改候选。
