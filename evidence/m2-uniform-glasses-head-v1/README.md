# 1K 制服候选眼镜与发型匹配回归

在固定提交 `925cc0823b5803e9adc2b9fdce91eb0f098d0ed6` 的构建 `4540a27be60e` 复现两个操作顺序。浏览器使用 `workbench=appearance&glassesFit=candidate` 和工作台同一角色控制器命令。两份女角色原签均关闭眼镜。男原发作为独立正控制。[旧构建运行回执](before/report.json)

| 原签和操作 | 旧构建实际结果 |
| --- | --- |
| 女性 `1049f87a` 原发，戴镜后换 `female-bob-v1` | 已加载 bob 网格可见，原发隐藏。保留同一人物与眼镜挂载实例、实际镜架和原发 fit。[侧景](before/female-glasses-then-bob.png) |
| 恢复同一女基模已签暖色 bob，再戴镜 | 已签 bob 资源及发型 fit 真实加载，接受挂载同一原发候选眼镜 fit。[侧景](before/female-bob-then-glasses.png) |
| 男性 `2e66ee6c` 原发，戴镜 | 原发网格可见，眼镜挂载并符合该身体候选镜架坐标。[侧景](before/male-original-glasses.png) |

回归核对原签记录哈希、实际身体、制服索引、发型资源和 fit、场景中唯一可见的眼镜以及镜架网格坐标。正式适配仍处于候选状态。

从工程根目录使用新输出目录复跑。旧模式要求精确旧构建摘要，并断言两种问题都能重现。

```powershell
node scripts/run-fixed-check.cjs experiments/worktrees/glasses-925cc082/prototype/dist scripts/qa-uniform-glasses-head.cjs before 4540a27be60ecf5a74302b4610652c3ac1b9b03e1755ea31b478d24e05f1a003 evidence/m2-uniform-glasses-head-v1/before-repeat
```

新模式要求显式给出修后固定分发树和完整摘要。它验证双向拒绝及原造型保留，卸镜后可换 bob，恢复原发后可戴镜，以及男性原发正控制。两模式使用同一批原签和精确身体、发型及眼镜 fit。[回归入口](../../scripts/qa-uniform-glasses-head.cjs)
