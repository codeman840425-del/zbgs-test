# 两份签名角色共用头发、眉毛底图

固定游戏构建 `9fc39b51d6ff`，源码 `df6100929c57dc1de93066c0695d900fff0f8b27`。复用原肤与暖肤的两份签名记录，游戏中可以独立改色、换装和卸载。两次独立检出的 529 个构建文件逐字节一致。[观看同镜头原速录像](index.html) · [构建回执](rebuild.json) · [独立游戏清单](inventory.json)

| Chrome 157 开发机实测 | 旧构建 d9cadedb54f6 | 本构建 |
| --- | ---: | ---: |
| 同时加载两人后的纹理对象 | 81 | 75 |
| 给其中一人更换发色 | 83 | 77 |
| 移除暖肤角色，继续绘制原肤角色 | 41 | 39 |
| 两人都已卸载 | 1 | 1 |

金色短发的主色与阴影、眉毛的主色与阴影仍各自有独立的采样和颜色控制。在两人同时绘制时，头发的四个实际 WebGL 绑定共用一份像素，眉毛的四个绑定也共用一份。关闭重开后以相反顺序移除角色，最后留下的暖肤角色仍正常绘制。首次手动改外接发型的 UV，观察到材质需显式同步；补上该同步后检查了改动前后的实际着色器输入。[实际绑定及原失败样本](after/comparison.json)

固定镜头、姿态和模拟时刻比较新旧游戏的脸部与半身。暖肤两张图完全一致，原肤两张各有 7 个像素相差 1 级。暖肤样板房的行走、坐下、起身和离开四个任务均完成，保留整段原速画面。该片验证当前两个配方和指定动作。[逐像素结果](appearance-comparison.json) · [动作结果](room-warm/report.json)

同屏组按两个角色独立估算为 276,127,056 字节。用已验证的像素和绑定修正重复计数，得到 260,398,416 字节，减少 15 MiB。本次只测到开发机的对象与绑定，实际显存占用、普通电脑帧耗时与生产准入仍待验证。旧预算及旧资源限制继续可复算。[双口径预算](budget.json) · [源图、尺寸及算法审阅](source-review.md)

## 复现

先依[固定重建记录](rebuild.json)取源码和锁定依赖，由[原签名批次](../m2-uniform-skin-v1/signed-pair.json)回放。下面示例在工程根运行，使用新的工程内输出目录。固定构建的复建方法沿用[上一版本](../m2-uniform-skin-v1/README.md)。

```powershell
$game = 'experiments/worktrees/texshare-df610092'
$dist = "$game/prototype/dist"
$out = 'output/replay-uniform-texture-sharing'
$records = 'evidence/m2-uniform-skin-v1/signed-pair.json'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist $dist --records $records --inventory evidence/m2-uniform-texture-sharing-v1/inventory.json --out "$out/standalone"
node scripts/qa-record-texture-sharing.cjs "$out/standalone" eed961f77ee1d5695bfe23fd36018b97d270262342266524f8bf192b4d35ec28 "$out/bindings" --expect-shared-hair-brow
node scripts/run-fixed-check.cjs $dist scripts/qa-record-skin-continuity.cjs 9fc39b51d6ff $records "$out/continuity"
node scripts/run-fixed-check.cjs $dist scripts/qa-production-record-room.cjs evidence/m2-uniform-skin-v1/room-warm/input-record.json "$out/room"
python -B scripts/production/record_budget.py measure $records --source-root $game --budget-version m2-technical-v1 --concurrent-group uniform-warm-bob-v1 uniform-original-bob-v1
```

最后一条仍按保守预算返回 1。实测范围内的估算另见同屏组的 `neutralSourceReuse`。签名、构建、文件或实际绑定证据不匹配时，工具保留原来的保守数值。
