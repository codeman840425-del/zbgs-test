# 038 既有jaw/waisthip：作用范围独立回归

本轮实际加载两个现有派生体及**各自原有742顶点裙、专属forearm/hand校准**，固定038341558517。没有新制源、不强装原女性open-waist、不施原女性覆盖；实际equipment报告bodyCoverage为null。两组合合法加载，没有绕过拒绝。普通衣物仍走现有精确profile，未改产品。

| 组合 | 精确bodySHA | 原裙/fit |
|---|---|---|
| m1a-jaw-v1 | 3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011 | m1a-jaw-v1-uniform-skirt / m1a-jaw-v1-uniform-skirt-pose-guide-v1 |
| m1a-waisthip-v1 | 10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5 | m1a-waisthip-v1-uniform-skirt / m1a-waisthip-v1-uniform-skirt-pose-guide-v1 |

两体分别执行一轮相同代表流程的完整语义掌指源面×最终裙外表面检查，approach-sit、technical-dance、final、idle+.1秒四姿均0交叉；测量明确在controller/avatar/live/equipment更新后。未把原女性数据改标。实际时刻、源面数、步数和加载装备在summary.json及原report/actual-surfaces.json.gz中。

两体各10项实际任务/动作时钟检查全通过；approach、seated、rise-end、dance-end四个普通refresh(0)边界首/重复最大位移均严格0且所有记录时钟不变。显式关闭修正会清历史，jaw起身末热→冷差0.063680855mm、waisthip约3.77e-12mm；重复冷解两者严格0。沿用原检查中冷解与普通暂停热解的区别，没有把非零热冷差抹去或修改碰撞阈值。四个browser runner均退出0，pageerror均0，所有Chrome/临时HTTP已关闭。

范围只包含当前walk/dance手避让及main延迟消费动作的代表姿态/时钟风险。原裙封口、身体/上衣其它交叉、坐姿硬折、连续skin、持物/其它舞/普通PC性能、用户观感均未升级。四静态手门不能推出整衣或所有派生通过。

## 可重复入口

两个新QA副本只让body参数显式选择这两体，并校验精确SHA/专属校准和记录实际装备。hand脚本保留原碰撞算法/阈值且要求四代表stage齐全；refresh脚本保留原十任务与四边界门。原女性脚本不改。

```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-hand-scope-variants.cjs 038341558517 <新目录> m1a-jaw-v1
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-refresh-boundary-variants.cjs 038341558517 <另一新目录> m1a-jaw-v1
```

腰臀使用同命令末参数m1a-waisthip-v1，始终使用新输出目录。固定dist可由5f4250a主线新检出重建到prototype/dist再替换dist路径；不是依赖忽略的旧worktree。原片恢复参照上层REBUILD-AND-RERUN.md的根已保存portable入口，不再另复制录像脚本。
