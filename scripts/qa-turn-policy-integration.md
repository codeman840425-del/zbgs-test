# Turn-policy 接入与实测（候选，自然度等待产品验收）

main.js 已按以下接口接线。默认使用新计划，`http://127.0.0.1:5173/?turnLegacy` 保留同一新人体的旧版算法作对照；`?legacy` 是另一件事（旧角色资产），对比转向时不要混用。

2026-11-14 新 Base_Female roundtrip（SHA256 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`）已实际加载到房间并完成浏览器测试。`node scripts/qa-turn-policy-browser.cjs` 通过。180°路径换向 1.083 秒；360° 2.167 秒，旧算法 7.858 秒。第一个 1/120 秒模拟子步即有朝向响应（不是测得8毫秒端到端输入延迟）。活动转身中重选路径、行走中180°反向、急停、舞蹈排队和坐下排队均完成，无页面异常、无转身腿伸展钳制。急停于0.27秒触发，0.525秒结束落脚。

连续支撑帧的实际 raw foot 世界位置变化最大约 `4.7e-13m`、朝向变化最大约 `4.3e-8rad`；旧版脚朝向每1/120秒约转 `0.006667rad`，验证了旧“锁脚踝但鞋底转动”问题。此指标描述骨骼刚性变换，不能代替所有鞋面顶点的接地/穿模测量。

证据在 `output/playwright/turn-policy/runtime.json`、`planned-turn.webm`、`legacy-turn.webm`、结束截图。录屏包含加载/加速数值检查阶段以及末尾正常速度完整360°，不是剪辑成片。已检查连续录屏采样画面，可见交替抬脚和前侧背各方向；程序短步转向尚非成熟动作捕捉，自然度没有宣布通过。裤裙全动作服装验收由主线另做。

## 旋转椅路径回归

QA提供的绝对椅坐标 `{x:2,z:0.57332736697,yaw:Math.PI/3}` 曾在4.817秒静默取消sit。复现时旧简化线段 `(2,1.2) → (2.359224407,0.780725675)` 穿过椅子OBB约2.9cm区间，6cm间隔的lineClear取样恰好漏过；运行逐帧碰撞触发clearPath。这不是转身无限循环。

main现用完整XZ线段与障碍矩形求交（椅子先换到local坐标）；中间路点以0.5mm阈值到达，避免原1.8cm阈值提前切角。`node scripts/qa-turn-policy-navigation.cjs` 验证原失败位置、另一60°椅位置、默认椅三个案例全部入座，碰撞计数0；原失败案例8.9秒完成入座。证据 `output/playwright/turn-policy/navigation.json`。这是导航与动作状态回归，不取代坐姿衣物顶点穿透检查。

`prototype/src/turn-policy.js` 是纯状态规划器，不修改位置和骨架。`motion.js` 已增加 `state.turnPlan` 消费路径，保留没有 turnPlan 时的旧转身便于同角色对照。不要再用旧 turnPhase 或角速度推进新计划。

## main.js 接入点

创建 `this.turnPolicy = createTurnPolicy()`。开始新的转身会话前（必须之前没有活动 turn plan）执行：

```js
const metrics = motion.getMetrics();
const free = metrics.feet.findIndex(f => !f.contact);
this.turnPolicy.reset(this.yaw, { preferredSwing: free < 0 ? 0 : free });
this.turnPolicy.requestHeading(heading); // path换向 / 对椅；最短方向
// 或 requestRotation(Math.PI * 2)，完整同方向360°，不能改用requestHeading(2π)
```

每个 `simulate(dt)` 中，只推进一次，dt≤0.05：

```js
let turnPlan = null;
if (this.turnPolicy.sample().active) {
  // 重选目的地仅改变heading请求，不reset；相同heading每帧提交是幂等的。
  // 完整360°模式不要在这里再次requestRotation，否则目标会不断延后。
  turnPlan = this.turnPolicy.update(dt);
  this.yaw = turnPlan.yaw;
  root.rotation.y = this.yaw;
  this.turning = true;
  this.speed = 0;
  moved = 0; // turn负责原地朝向，路径独占平移
}
motion.update(dt, { /* 原有字段 */ turning: this.turning, turnPlan });
// 即使 update 返回active=false，该最后一帧turnPlan仍必须传给motion完成落脚。
// 下一帧才开始路径平移；此时不再传turnPlan。
```

新目标在活动计划中调用 `requestHeading(newHeading)`，不可 reset / 清空；当前<=180ms的摆腿先完成，再执行最新方向。急停调用 `stop()`，停止新增角度目标，完成当前落脚及必要收脚；继续把计划交给motion直到active=false。`clearPath()` 不可直接销毁活动转身，除显式测试重置/传送外仅清除路径并 stop。切换坐姿/舞蹈也应等待转身脚落地，不能瞬移退出计划。

删除原先pathTurn的0.5s settle等待及0.8rad/s推进，替换为以上入口；保留小角度连续行走转向。大角度阈值可先保持0.65rad。不要把`turnPlan.active=false`仅当作还要等0.5s的理由。

## 已运行数值回归

仓库根：`node scripts/qa-turn-policy.mjs`。30/60/120Hz均覆盖左/右180°、同方向360°、中途重选、急停、±π跨界、重复请求、非法dt。180°约1.08–1.10秒，360°约2.17秒；首帧有根朝向及抬脚响应；连续支撑的计划鞋朝向变化为0。报告：`output/turn-policy/regression.json`。

以上只是策略计划，不是实际脚底或自然度验收。实际新Base_Female必须录完整左/右180°、360°、步行途中反向、0.27秒重选/急停；检查支撑鞋**实际世界位置及四元数**，不能只读旧ankle slip。新增metrics `turnPolicy`、每脚`turnWorldQuaternion`供对照。若身体每短步明显顿挫，需要调整角度曲线或换成熟turn clip，不得把数值时长达标称自然度已通过。
