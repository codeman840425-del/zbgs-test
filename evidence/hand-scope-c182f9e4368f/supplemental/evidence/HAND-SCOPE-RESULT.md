# 扩大现有手接触执行范围：隔离反证实验

**定向反证成立，但不直接发布。** 原 7a86 在两个已确认 walking/dance 姿态及舞末分别有 203/165/5 个实际掌指×裙面交叉；唯一 guard 改动后的 c182 四个采样均为 0（第四个是结束后 +0.1s，原版此时也为 0）。只对这四姿成立，不继承为完整动作或所有人物接触通过。

**审查后保留不集成：** 已分解确认新增左腕单步15.048/13.488mm来自既有solver最大palm投影突然减少/消失；源腕没有变化。该精确第二次寻路过渡现已补正常1×room/固定近片，真实时钟仍有投影撤销；880条rail全表反证确认是有限投影区间退出，不是grid漏选。局部17连续帧已审，未替用户接受新增细跳。详细新证据见 `EXACT-TRANSITION-RESULT.md`。见 `WRIST-SNAP-CAUSE.md`，不能只引用旧右腕34mm内跳改善。

## 版本与唯一修改

- 基于提交 `39238212ef07fcc526cb40654135da66fdfc0bdd`，独立 detached worktree `experiments/hand-scope-worktree-1`。
- 锁依赖 `npm ci --ignore-scripts` 成功，33 packages、audit 0；原源码实际重建为 `7a86c24e34aa`，保存 `baseline-dist`。
- `prototype/src/motion.js` 只在 `leavingIdle` 提前返回处允许 `requested === "walk" || requested === "dance"` 继续；其它动作谓词、源腕目标、五轮求解/阈值、权重、动作幅度完全未改。旧无校准 idle-cache 分支保留；当前精确原女性有校准 forearm 和 joint-hand workspace，不能进入该旧分支。
- 新 build `c182f9e4368f`，独立 `candidate-dist`。`evidence/portable.patch` 为唯一局部 diff，未合共享主线、未发布。

## 实际采样与成本

完整真实掌指源面（2336 面，含混合权重边界）×最终显示裙面，读取 body 覆盖前完整索引引用；只在四个指定姿态做重几何门。其间按原房间控制顺序推进，保留全部 2441 个 1/120s 子步时钟/相位/原始腕位姿/handContacts，非仅 proxy clearance。

| 姿态 | 原 7a86 | c182 |
|---|---:|---:|
| 4.608333s，走向椅子 | 203 | 0 |
| 13.108333s，技术舞 | 165 | 0 |
| 20.241667s，舞末刚切 idle | 5 | 0 |
| 20.341667s，idle +0.1s | 0 | 0 |

所有步 root 和 jogPhase 差严格 0；动作总时长相同。最大实际 raw wrist 位置差 **34.691 mm**，不是微调；规范化四元数后的最大角差 `2.415e-6°`。手指/腕朝向不被人为改轨。坐稳、起身、转身、结束后0.1s对应腕位置差为0。

34.691 mm 最大差出现在 4.541667s idle→walk：原版腕单步向源姿退回 **33.653 mm**，候选单步 **3.092 mm**，因此不能把“版本间修正差突然增加”误称候选突然弹开。但也不能宣称所有修正连续：同 120Hz 记录 4.708333s 左腕原单步 6.033 mm、新 15.048 mm（新增约9mm），具体事件留在 `wrist-step-review.json`，需要连续观感判断，未再调参掩盖。

粗成本为同步 `simulate(1/120)` 实测，排除截图、重几何采样和序列化；非 rAF 性能门，也不是普通PC数据：跑阶段均值 **1.651→2.669 ms/substep**，舞 **1.439→2.389**；坐稳 **3.915→3.927**。新增约1ms/substep，不是零成本。没有通过减碰撞频率获得结果。

## 正常1×证据和观看边界

- `related-video/sit-rise-turn-technical.webm`：同 room 镜头，坐下→起身→360°转身→走至空地→完整7.2s技术舞。wall 19.3225s，sim 19.2687s，比值 **0.997216**；任务完成，pageerror 0。
- `run-video/speed-2.40-full.webm`：真实UI 2.4m/s，原同房间安全直线路径；wall 5.2113s，sim 5.2113s，比值约 **1.000000**；任务完成，pageerror 0。
- 正常片只轻量采腕/状态，没有全手网格门插入录像；同版原片和 trace 完整保留。与根现有 7a86 `evidence/body-coverage-7a86c24e34aa/{normal-speed,run-video}` 对照。
- 已看新旧指定姿态正侧近图：手从裙面中移到侧旁，未见这些静图中明显抬肩/反腕。已逐张审看两条片全时段4fps概览，整体动作序列齐全；room角色较小，不能凭概览排除毫米级弹手或将抽帧冒充正常速度连续观感通过。原片供根/用户按1×观看。
- 本轮没有新增大范围动态skin矩阵、没有断言男性/派生/持麦/其它舞已通过，也不自动合入。这一实验确认控制遗漏的直接因果作用，仍需根决定是否接续整段观感和成本验收。

## 重建和复跑

在新 worktree 检出上述提交，运行 `npm ci --ignore-scripts` 后先 `npm run build -- --outDir ../baseline-dist`。在 worktree 根 `git apply evidence/portable.patch`，再 `npm run build -- --outDir ../candidate-dist`；应得到 c182。

QA 从主工作区执行（临时server随脚本退出自动关闭）：

```
node scripts/run-fixed-check.cjs experiments/hand-scope-worktree-1/baseline-dist experiments/hand-scope-worktree-1/qa-hand-scope.cjs 7a86c24e34aa <新输出目录>
node scripts/run-fixed-check.cjs experiments/hand-scope-worktree-1/candidate-dist experiments/hand-scope-worktree-1/qa-hand-scope.cjs c182f9e4368f <另一新输出目录>
```

`qa-related-video.cjs`、`qa-run-video.cjs` 为现有录像脚本的局部复制，只增加逐帧腕/handContacts字段，不改变原镜头/动作/播放速率。`compare.py` 重算规范化角差/成本并写证据 manifest。所有浏览器和临时服务已退出。固定source/dist在独立目录；主源码未动。
