# 原女体长束发分区配色

[打开本地同镜头对照及 1× 影片](index.html)。源码 `d58237810347543e0e27e9593f9a242742d00c2c`，构建 `522c64d40786`。原款与分区款共用一个 744,864 字节的 GLB、一具原女体及金色基础发色。分区数据覆盖 609 个顶点，其中 305 个使用非白色乘数。适用范围限本次束发、身体和两份原签。

原作者许可记录和制作配方均从该提交实际检出。固定制作入口生成的 6 个文件与提交内运行资产逐件相同，对同一位置重跑返回 `reused-identical`。[制作回执](fixed-522c/production.json)

独立的 A、B 源码检出各自离线构建，使用锁文件相同的既有依赖。两份完整 dist 的 551 个文件、743,289,115 字节相同。两边分别通过普通 inventory 和 export 消费[两份原签](signed.json)，两包均有 44 个文件、46,229,245 字节。审核表包含 11 个游戏入口依赖，清单 SHA-256 为 `c226665e233efbc2c100898e4e440aa1b011305e9808f73f5dd4be11a039e2a7`。[构建和包的逐件对照](fixed-522c/comparison.json) · [实际包清单](fixed-522c/inventory.json)

工作台从 F 盘根调用临时端口，切换原款、分区、恢复原款。背面、侧面及房间镜头分别保留 14,619、16,363、505 个轮廓样本，分别有 3,901、3,371、98 个可测变色像素。冷开后拦截遮罩请求造成 503，原先外观保留；恢复请求后重新导入内容与保存时一致。[工作台回执](room-522c/report.json)

独立游戏从 B 包普通入口读取同一对角色，首次和冷开两次都验证相应几何颜色、身体验证摘要、fit 及实际绘制材质程序的 WebGL 链接状态。分别移除金色和分区角色后，留场角色继续绘制，离场角色自己的几何释放一次。开发机 Chrome 157.0.8103.79。[游戏回执](game-522c/report.json)

在 B 包的新导出目的地，旧运行审核被拒绝，缺失或等长篡改分区 fit 均在产出前失败。恢复原 fit 后用同一目的地成功导出。[命令、错误和重试](fixed-522c/export-retry.json)

## 重跑

在制作主工程 `F:/gamemake` 打开 PowerShell，使用下面的已保留固定目录。传入新的证据子目录，两个浏览器检查串行运行。工具自行分配临时环回端口并在结束时释放。若需从源码重新生成 dist，使用 `python -B scripts/character-worktree.py create 名称 d58237810347543e0e27e9593f9a242742d00c2c --runtime-only` 创建新的项目内运行检出，按[已有的离线构建步骤](../m2-paired-ear-game-v1/rebuild/README.md)准备依赖与项目内缓存。H04 的运行审核文件为 `scripts/runtime-package/game-record-hair-region-reviewed.json`。

```powershell
$a = 'experiments/worktrees/hair-h04-a-d5823781'
$game = 'output/m2-hair-region-game-v1/fixed-d5823781/b/game-package'
$ev = 'evidence/m2-hair-region-game-v1'
$pin = 'c226665e233efbc2c100898e4e440aa1b011305e9808f73f5dd4be11a039e2a7'
node scripts/run-fixed-check.cjs "$a/prototype/dist" scripts/qa-hair-region-room.cjs 522c64d40786 "$ev/room-replay"
if ($LASTEXITCODE) { throw '工作台检查失败' }
node scripts/run-fixed-check.cjs $game scripts/qa-hair-region-game.cjs $game $pin "$ev/signed.json" "$ev/game-replay"
if ($LASTEXITCODE) { throw '独立包检查失败' }
```

## 失败基线

`7afff372 / 9634bde3f584` 的原签、旧构建和导出验证保存在本目录的 `rebuild/`。旧版把 Three r187 提供的四分量颜色用于 MToon 3.5.5 的三分量颜色乘法；CPU 上的顶点和材质状态正常，WebGL 程序链接失败，画面中束发消失。修正版仅在该分区材质的克隆上取 RGB 分量。旧运行审核身份已移出当前外部角色记录登记。旧来源校验另保留了不匹配字节和还原重试诊断。[失败实际绘制](failed-9634/shader-report.json) · [归档审核](failed-9634/review.json) · [旧制作来源诊断](../m2-hair-region-release-v1/fixed-source-provenance.json)
