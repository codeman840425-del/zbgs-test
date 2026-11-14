# 走跑与收步回归：固定构建数值证据

本页记录一个有界回归，不另立能力状态清单。`scripts/qa-locomotion-transitions.cjs` 使用真实固定房间、当前控制器和最终蒙皮，在暂停自动更新后按120Hz推进。**这不是正常墙钟速度录像，也不是性能测试**；完整视觉仍须另外观看。

原因与生产修改见 [M1-LOCOMOTION-TRANSITION.md](M1-LOCOMOTION-TRANSITION.md)；本页仅说明独立回归方法、固定阈值和证据，不接管当前能力状态。

## 失效点与独立测量

ca72原录像female-base约5.3–6.1秒跑→走时出现假着地后拖脚。原trace `runtime/m1c-runtime/female-base.json` SHA256为 `057df77040be1b1d3eb92942d2a5ec299391046a3f28f55e49899e0ea495c9cd`。trace最大左支撑误差约310.81mm、源姿态至足目标偏移约619mm；不是根据单张截图推定。

测试最先按原命令时刻统一120Hz重算，并未复现原rAF的窄相位问题，负例oracle按要求失败，未将“没有测出”写成旧版通过。随后固定一个明确的**相位触发样例**：按实际Jog步距及控制器2.5m/s²减速度计算降速请求相位，预测在runPhase约.278跨越1.55m/s边界。离散步进前一帧约.270，处于双脚释放窗口；它不是原录像时序的逐帧复刻。

同一相位样例在ca72实际复现：左支撑误差峰453.21mm、连续reachClamp975ms、实际鞋patch支撑段水平漂移280.15mm。脚目标没有大单帧跃迁也仍然失败，说明仅检查目标跳变不足。

独立检查在avatar最终更新后执行 `updateMatrixWorld + skeleton.update`，按实际鞋网格UUID/顶点引用重算heel/toe蒙皮patch：XZ平均、Y为1mm soft-min。实际patch到anchor距离、patch支撑段漂移、raw踝位置、每帧target位移均保存；不只相信IK求解器目标值。接触种类/anchor改变时另起支撑段，heel→toe转移不误算成同一材料锚点。库内contactTravel和reachClamp同时保留交叉检查。

## 固定门槛及理由

| 指标 | 失败门槛 | 理由/边界 |
|---|---:|---|
| 实际支撑误差 | >30mm | 本轮明确约束；远大于已有正常鞋patch几毫米残差，但不能容许大幅误锁拖腿。 |
| 连续reachClamp | >0.1s | 连续超过12个120Hz步仍不可达即拒绝；孤立边沿求解残差与持续卡脚分开。 |
| 单步target或raw踝位移 | >60mm/120Hz | 宽松的异常跳变门槛，相当于7.2m/s；源摆腿与根运动可产生数厘米正常步差。通过不等于无可见跳变，实际最大值必须继续报告。 |
| 鞋patch最低高度 | <−6mm | 沿用既有鞋底回归的边界；与小于约1.5mm的既有残差区别，不要求数值绝对零。 |
| 连续接触单步travel | >15mm | 拒绝明显单步支撑滑动；不把heel/toe接触切换当作连续同点。 |
| 同anchor支撑段水平漂移 | >30mm | 累积误差门槛，避免小单步滑动累计后仍被放过。 |

阈值在ca72负例及后续候选之间不变。它们是退化检测，并非所有运动、视觉自然度或精确物理碰撞标准。

## 组合与中间候选

女性基础/裤/裙，男性基础/裤，共五例；不伪造不存在的男性裙装。每例包含原命令时刻重算、窄相位降速，以及.05/.30/.55/.80四个相位触发的walk→run→walk。每轮包含起步、自然减速停止；最后一轮另有重新起跑、反向目标、转向期间再次重选及显式急停。每次重置只用于独立样例的开始。

ff91的双脚姿态匹配修复了窄相位误锁：该样例女性支撑误差约2.29mm。不过完整矩阵仍失败：女性三外观phase.30左脚持续clamp116.7ms，phase.80右脚258.3ms；男性两外观原命令样例258.3ms、phase.30为116.7ms。最大支撑误差仍低于30mm，**没有因此取消持续不可达门槛**。失败发生在减速停止后的收脚等待，另由主实施者修改停步期髋部可达性处理。

ca72负例与ff91摘要、身份回执和首个失败片段保存在 `evidence/locomotion-transitions-ca72-ff91/`。全部120Hz数据留在各自output目录，未用巨大重复数据充当源码资产。

## 0df63固定候选结果

`0df63cf2bdea` 在原门槛下五例×六场景全部通过，合计46,861个120Hz样本，0页面错误。先完成女性基础，再完成其他四例，没有重复运行已通过的首例。证据在 `evidence/locomotion-transitions-0df63cf2bdea/summary.json` 与 `identity-receipts.json`。

- 最大实际支撑误差：女性2.294mm、男性3.219mm。
- 最长连续reachClamp：女性58.3ms、男性0。原ff91收步116.7/258.3ms均已降到门槛内。
- 最大target/raw踝单步位移55.17mm；这是宽松异常跳变门槛内的结果，不写成“完全看不到动作跳变”。
- 最大连续contactTravel0.931mm/步、同anchor支撑段漂移4.431mm；最低鞋patch约−1.080mm。

原ca72的45cm窄相位误锁未重现；原负例和中间收步失败证据保留。该结论仅是这些固定数值场景通过，正常速度完整录像、服装形状、精细握持和目标普通PC仍由各自验收记录决定。

重复入口：

```powershell
# 原负例只有确实出现 >30mm 支撑错误才算 oracle 成功；不是产品通过。
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/qa-locomotion-transitions.cjs ca72ada827d2 --negative-baseline
# 新候选保持相同门槛；可先限定一例，再补其余四例。
node scripts/run-fixed-check.cjs experiments/m1-<BUILD>/dist scripts/qa-locomotion-transitions.cjs <BUILD> --cases=female-base
node scripts/run-fixed-check.cjs experiments/m1-<BUILD>/dist scripts/qa-locomotion-transitions.cjs <BUILD> --cases=female-pants,female-skirt,male-base,male-pants
```

固定版本与真实主体SHA在运行前后校验；Jog文件SHA也实际校验。任何场景超时、缺少真实patch、页面错误、非法目标或非有限数值不能按成功处理。当前覆盖是少量相位，不是穷举所有相位/所有速度，且没有脚皮全三角连续碰撞或正常速视觉通过声明。
