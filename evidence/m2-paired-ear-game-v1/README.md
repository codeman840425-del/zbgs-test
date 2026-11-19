# 同一款耳钉跨身体批量制作

[看工作台和独立游戏的原速录像](index.html)。此包验证两具原版制服身体。美术端把金色耳钉半径从 2.6 毫米改为 3 毫米，沿用作者的程序几何和材质，重新测量男女各自的耳面。每款只有一份 GLB，每个身体一份含两侧坐标的适配文件。[配方和测量](../../assets-source/paired-ear-style-batch-v1/README.md)

制作批次只指定一次上衣、裤装和双耳 3 毫米款。生产端为两具身体分别签出 revision 1 记录，准确记录身体、资源、适配版本与左右佩戴状态。[批次输入](../../assets-source/variant-matrix-v1/paired-ear-style-batch.json) · [浏览器签出的两条记录](signed.json) · [正式模式的两项拒绝](formal-plan.json)

固定源提交 `e01413e3a763ee4552fc225bd791a2d5ebd16666`，两份固定构建均为 `3c15a020d62a`。两个独立游戏包的 48 个文件及 76,285,057 字节逐一相同，清单为 `02b5def86e2af426195190dd4b8b3221a997ce03fa432ce51dac5456ca4b2ed2`。包中只含选定耳钉和两份 fit。固定游戏保持每条角色记录原签。[两包比对](rebuild/package-comparison.json) · [受审清单](rebuild/inventory.json)

实际 Chrome 157 在侧脸镜头中逐人切换旧款双耳、新款双耳、新款左耳和卸下。独立游戏页面另开两个全新浏览器进程，各自读回同两个人，并实测四只耳钉在头部运动时挂点稳定、进入渲染。耳钉在侧脸近景能看清，正常游戏镜头里的款式差别很小。[工作台操作和实际绘制计数](workbench-01/report.json) · [两次冷开](cold-01/report.json)

适用范围为这两个身体的原发和本次两款刚性耳饰。长发遮挡、摆动式耳环、其他头型、正式整套穿搭准入和普通电脑性能仍待独立验证。开发机为 RTX 4090。

在工程根目录执行。下列命令使用工程内的新输出目录，临时服务随验收退出。

```powershell
$fixed = 'experiments/worktrees/ear-style-a-e01413e3/prototype/dist'
$package = 'output/m2-paired-ear-game-v1/game-package'
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/paired-ear-style-batch.json --root . --diagnostic --output output/ear-replay/plan
node scripts/character-production-cli.cjs --dist $fixed --request output/ear-replay/plan/diagnostic-requests/create-001.batch.json --out output/ear-replay/signed.json --evidence output/ear-replay/signing
node scripts/run-fixed-check.cjs $fixed scripts/qa-ear-style-game.cjs workbench 3c15a020d62a output/ear-replay/workbench
node scripts/run-fixed-check.cjs $package scripts/qa-ear-style-game.cjs game 3c15a020d62a output/ear-replay/game
```
