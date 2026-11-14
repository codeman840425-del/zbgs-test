# 坐下前臂扫腰圈：只读复核与最小控制建议

2026-11-14，未修改 `motion.js`。固定历史ca72的完整坐起作者捕获在frame77（坐下进度.40437、源时间2.533秒）出现左前臂扫过拟议的固定腰孔边界。`assets-source/m1/offline-corrective/ring-cage-v1/source-arm-blocker.json` 保存frame76–78世界坐标、原VRM SHA、全primitive索引匹配和可复现capture命令。**这是前臂与新固定腰圈的相容性证据；旧运行时fit检查的是旧投影裙面，不能未经新运行时复测就宣称两者表面完全相同。**

当前 `fitSeatHands()` 已经处理forearm，不能说它只管手掌：`motion.js`约1017行对 elbow→wrist 采用半径12mm的中心加四条轴向rail；hand另用16mm。`railClearance`约939行加8mm单方向余量；projection grid按衣物实际三角查询。ca72打包JS也实际确认相同`["forearm",..., .012]`和5 rails，并非只拿新代码猜旧版本。

真实源尺寸表明这个代理包不住胳膊：同一Bodybaked primitive、LowerArm权重>.5且位于肘腕区间的148点，前臂长214.30mm，半径P95 **31.39mm**、最大 **33.49mm**；左右基本对称。实际失败face3556/3557位于轴向.123–.232处，半径24.13–30.71mm，比理想对齐方向下12+8=20mm保护仍大4.1–10.7mm。五条rail不是完整圆周支持，斜向保护还更小。源face3792/3794在轴向-.081..+.012，其中部分位于肘后约17mm，但主要权重仍为LowerArm90–92%；从肘点开始的线段没有球形端帽，漏掉这部分圆肘表面。该尺度与实测5.5–9.5mm负侧穿入相符。

复算命令 `python scripts/m1-assets/audit-seat-forearm-profile.py`；结果 `forearm-profile-audit.json` 记录source/motion SHA、分段半径和失败面数据。它测量真实绑定源的几何，不是当前姿势完整skin碰撞证明；新体型必须重新校准，不能硬抄女性常数给男性。

还有两项代码事实，应作为修复边界：

- sitProgress≥.35时 `blend=1`，`outward`侧向分量 `sign*(1-blend)*.8` 归0，只剩前/上方向；frame77正处此阶段，可能迫使前臂从侧腰向前扫。这是需独立复现的第二线索，不把它当唯一根因。
- 最多5轮迭代后仍直接 `solveChain` 并恢复hand orientation；`remainingClearance`取自最后一轮移动target/pole之前，没有最终求解后重新查整臂。因此非0残差也不会阻止应用，日志不能当碰撞通过。

最小通用调整建议（由动作实现者执行）：

1. 从语义LowerArm/Hand、真实body权重表面在资产加载/生成阶段校准分段半径与肘端帽。用完整的渐变半径前臂capsule或实际segment-triangle距离替代五条12mm rails；保留现有三角broadphase，不全场扫描。不是简单把腕目标扩大，也不是把角色手臂变细。
2. 保留现有 wrist target + elbow pole 双控制，使用完整前臂残差决定侧/前可行离开方向，避免在过渡中侧向路由自动归零。限制/平滑实际移动并保存肘弯曲半球；无法消除残差时如实记录失败，不以降低动作幅度或隐藏内层通过。
3. 最终solve后重新核 capsule，包括肘端帽；QA在正常VRM更新后独立检查实际forearm skin。记录实际肘/腕、分段半径、最终最小间隙、剩余穿入和迭代数。新增body只更换由几何导出的profile，不写特定clip或身体ID补丁。

有界回归：固定同版本女性裙装坐下起身全程，特别重放frame75–80，30/60/120Hz同源时间；先检测实际前臂与固定腰边，再看整段正常速度是否出现新跳臂/耸肩/肘翻。不要用仅手掌点、单张截图或仅最宽半径通过代替整条前臂。当前root已有修复安排时应复用同一接口，不同时写两套手臂控制器。
