# 1K 制服候选眼镜与发型匹配回归

在固定提交 `925cc0823b5803e9adc2b9fdce91eb0f098d0ed6` 的构建 `4540a27be60e` 复现两个操作顺序，在 `da9cae259fe5ebb1c718b4d17fc10312592834cd` 的构建 `08253a07fc73` 验证修复。浏览器使用 `workbench=appearance&glassesFit=candidate` 和工作台同一角色控制器命令。两份女角色原签均关闭眼镜。男原发作为独立正控制。[旧构建运行回执](before/report.json) · [修后运行回执](after/report.json)

| 原签和操作 | 旧构建实际结果 | 修后构建实际结果 |
| --- | --- | --- |
| 女性 `1049f87a` 原发，戴镜后换 `female-bob-v1` | 已加载 bob 网格可见，原发隐藏。保留同一人物与眼镜挂载实例、实际镜架和原发 fit。[侧景](before/female-glasses-then-bob.png) | 拒绝。保留原发可见网格、同一人物、同一眼镜挂载实例及 fit。[侧景](after/female-glasses-then-bob.png) |
| 恢复同一女基模已签暖色 bob，再戴镜 | 已签 bob 资源及发型 fit 真实加载，接受挂载同一原发候选眼镜 fit。[侧景](before/female-bob-then-glasses.png) | 拒绝。已签 bob 的可见网格、资源、fit 与人物实例保留，场景中没有新眼镜。[侧景](after/female-bob-then-glasses.png) |
| 男性 `2e66ee6c` 原发，戴镜 | 原发网格可见，眼镜挂载并符合该身体候选镜架坐标。[侧景](before/male-original-glasses.png) | 正控制通过，眼镜身份与七个镜架网格的独立复算一致。[侧景](after/male-original-glasses.png) |

两项拒绝均由控制器返回「此镜腿适配仅支持原发」。卸镜后同一女角色可换 bob，已签 bob 切回原发后也可戴镜。回归核对原签记录哈希、实际身体、制服索引、发型资源和 fit、场景中唯一可见的眼镜以及镜架网格坐标。眼镜的发行状态仍为候选。[卸镜后换 bob](after/female-bob-after-removal.png) · [切回原发后戴镜](after/female-glasses-after-original.png)

首次修后运行已经返回原发限制并保留旧造型。回归脚本的提示匹配漏掉了「原发」，因此提前结束。保留首次记录，并以实际限制文案和场景状态为断言在同一构建完整复跑。[首次诊断](after-first-diagnostic/report.json)

从工程根目录使用新输出目录复跑。两模式显式锁住完整构建摘要，使用同一批原签与同一组精确身体、发型和眼镜 fit。[回归入口](../../scripts/qa-uniform-glasses-head.cjs)

```powershell
node scripts/run-fixed-check.cjs experiments/worktrees/glasses-925cc082/prototype/dist scripts/qa-uniform-glasses-head.cjs before 4540a27be60ecf5a74302b4610652c3ac1b9b03e1755ea31b478d24e05f1a003 evidence/m2-uniform-glasses-head-v1/before-repeat
node scripts/run-fixed-check.cjs experiments/worktrees/head-da9cae25/prototype/dist scripts/qa-uniform-glasses-head.cjs after 08253a07fc73656fb520e5108dd525d683bc04b3f241a2eca671749b0bde1603 evidence/m2-uniform-glasses-head-v1/after-repeat
```
