# 7586 角色记录的法线贴图复算

[前后录像和原尺寸运行截图](index.html)。原生男性的旧衣和短裤袜装沿用相同的签名记录。固定游戏源码为 `3058c41c7c2dd4e999764a742814c6201bc94af0`，旧版为 `cfca0dd13af69418dc063d6715c43523184195f9`。工作台、独立游戏包和测试各自的身份记录在对应报告中。

在主工程根目录运行下面的 PowerShell 命令，使用新的工程内目录重建。构建和浏览器验证需要锁文件中的 Node 依赖及本地 Chrome。Python 图像核查使用 Pillow。

```powershell
python -B scripts/character-worktree.py create native-normal-reproduction 3058c41c7c2dd4e999764a742814c6201bc94af0
$source = 'experiments/worktrees/native-normal-reproduction'
npm.cmd --prefix "$source/prototype" ci
npm.cmd --prefix "$source/prototype" run build
$dist = "$source/prototype/dist"
$records = 'evidence/m2-native-short-socks-room-v1/records.json'
node scripts/run-fixed-check.cjs $dist scripts/qa-body-normal-lifetime.cjs $records fbf65135f5eb shared output/native-normal-reproduction 1
python -B evidence/m2-native-body-cost-v1/compare.py --new-build fbf65135f5eb --new output/native-normal-reproduction
node scripts/runtime-package/game-record-cli.mjs export --dist $dist --source-root $source --records $records --inventory evidence/m2-native-body-cost-v1/inventory.json --out experiments/native-normal-game-reproduction
node scripts/run-fixed-check.cjs experiments/native-normal-game-reproduction scripts/qa-production-package.cjs output/native-normal-game-restore $records
```

浏览器检查和导出要求输出目录先前不存在。`rebuild/report.json` 记录了另一份全新检出构建的 508 个文件；`game/report.json` 记录了独立包的双人消费、关闭恢复和坏输入拒绝。录像在开发机上录制。两种法线的实际 WebGL 纹素分配见 `comparison.json`，静态预算与目标设备限制见 `textures/README.md`。网格派生仅作离线实验，重建命令见 `mesh/README.md`。
