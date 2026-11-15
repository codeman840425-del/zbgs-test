# 038 最终四姿真实接触与0b逐步比较

已实际完成唯一一轮 `qa-hand-scope.cjs`，固定038341558517、原女性精确身体、2441个1/120秒步。页面错误0，场景未失败，Chrome及临时服务已关闭。没有新增矩阵、录像或产品修改。

| 实际测量时刻 | 阶段 | 0b交叉对 | 038交叉对 |
|---:|---|---:|---:|
| 4.608333333333352 | approach-sit | 0 | 0 |
| 13.10833333333323 | technical-dance | 0 | 0 |
| 20.24166666666616 | final | 0 | 0 |
| 20.341666666666153 | idle +.1秒 | 0 | 0 |

实际2336个完整语义掌指源面（保存覆盖前完整身体索引）与最终显示裙表面；阶段是 controller、avatar/live、equipment 更新之后。有限非共面边交叉及原alpha门未放宽，不等于连续CCD、全部衣物或视觉通过。

## 逐步差值：几何门通过，严格姿态恒等不通过

2441步time、root、phase、jogPhase最大差均严格0。实际腕位置最大差 **0.399398409mm**，右手、rise t11.075秒；四元数最大分量差1.4212e-12。按阶段腕位置最大差：run0、approach-sit .398443mm、坐稳0、rise .399398mm、turn .170872mm、dance约2.32e-9mm、结束idle0。

最初比较器使用逐值零差断言，因此以退出1保留 `passed:false` / `strictPoseIdentityPassed:false`；本次没有放宽此结果。另列 `surfaceGatePassed:true`，避免把“非逐位相同”错误称为四姿接触失败。原任务要求报告差值，不要求main时序修复必然逐值等价。

## 差异分解与因果边界

t11.066667、11.075、11.083333三个相邻步，右腕 `authoredWrist`、`initialTarget` 均严格相同，phase/jogPhase/sitProgress也相同。

- t11.066667：投影17.302273→17.687016mm，releaseSeed两版都15.988049mm，说明首个局部差异是本步碰撞投影，不是先有seed差。
- t11.075：投影16.205550→16.604948mm，差.399398mm与实际腕位置差一致；此前投影差进入下一步seed，15.058596→15.393448mm。
- t11.083333：投影16.257498→16.626436mm，差继续释放。

上述三步实际腕单步旧→新为8.093691→7.802444mm、8.200050→8.188678mm、7.401835→7.424434mm。不是新增.399mm的同量瞬跳。整段最大“新单步长度减旧单步长度”为 **+.306894mm**，在approach-sit t7.858333，8.110856→8.417750mm。这个小增量仍如实保留，未从数值代替观感裁决。

同时间lapContact、lapAxis与lapUp略有改变，说明下肢/裙接触输入并非完整逐值恒等；主main修改取消`setMode`提前`rig.setAction`，让下一次`rig.update(state.action)`统一消费。在motion.update既有分支中，首次sit/dance还会清`turnIdleAnchor/turnIdleQuaternion`；旧提前setAction会令该分支不进入。**这是现源码能指出的具体语义差异及下肢输入改变线索**，不是纯标签改名。当前存储trace没有完整raw腿骨/所有裙顶点或actionTime，不能仅据这批数据把全部.399mm唯一归因为清锚分支；也不能声称已逐值证明actionTime相等。能直接确认的是源腕/初始目标未变，差异经本步投影再进入releaseSeed。没有为追零差追加浏览器或改变产品。

## 证据与复跑

`contact/actual-surfaces.json.gz`、`contact/report.json`、四姿正侧图保留新身份；旧0b文件未动。`contact-comparison.json`保存输入双SHA、局部两版contact字段、逐阶段差和最大单步差。`compare-contact.py`可离线重复，严格恒等断言预期仍退出1，真实surface门独立为true。

```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist experiments/hand-scope-worktree-1/qa-hand-scope.cjs 038341558517 <新输出目录>
python evidence/hand-release-038341558517/compare-contact.py
```
