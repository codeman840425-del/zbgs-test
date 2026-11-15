# 连续转向 ece523fa4973 隔离候选

基于087跑步意图修复，只改main.js导航转向；motion/脚锁/服装/live完全沿原1a隔离副本，**不含已发布f7新版麦克风**。不能将整个旧main覆盖共享新源码。portable.patch相对087的局部补丁，LF规范化diff；raw及LF身份见manifest。

根因：6ef两套减速交接让转向先brake到.483m/s，再cos³到.0885（数值低至.00588）。改用侧向加速度单一约束后，afebe扩大弧线撞边界并clearPath；这暴露测试只认idle未核目标。f91加两侧可走区域前瞻，仍出现近目标orbit：距离183.69mm但转弯半径253.74mm。

最终有限修正：使用目标距离相关曲率k=2sin(min(abs(angle),pi/2))/min(.8,dist)，期望速度受sqrt(4.5/k)、3.2/k限制，实际yawRate同时受v*k、4.5/v、3.2限制。不存在min速度地板。保留连续原walk1.5/run3.4加速、2.5减速、静止整步转身、现有碰撞/路径请求。仅反向超过2.8rad时一次比较两侧1.5秒的现有blocked+lineClear可行性，选更宽裕侧；新目标清除旧选择。

失败及界限：两侧均受阻时没有新全局曲线规划保证，现有碰撞拒绝仍保留；狭窄家具复杂路线未穷尽。最大前瞻1.5秒；反向可选非最短角方向避墙。直线angle0几何保持原加速与clip控制。legacy分支保留旧cos策略，诊断用。

actual shoe原门槛未改。14男女裤装场景通过且每条末点误差<=18mm，包括原片晚触发快速重选的针对反例。连续reachClamp最大91.7ms接近原100ms门槛，不能省略此限制。正常6片/同room镜头在evidence/curvature-turn-ece523fa4973，全部到合法目标；接受观感仍由用户决定。

复跑：在完成087源码恢复的隔离工程应用portable.patch，再npm run build。具体产物为experiments/m1-curvature-turn-3/dist。run-fixed-check包裹scripts/qa-curvature-turn-room.cjs <build> --run-intent-only --cases=female-pants,male-pants。正常片脚本使用QA_M1_BUILD、QA_BASELINE_MATCH和可选QA_SCENARIOS。
