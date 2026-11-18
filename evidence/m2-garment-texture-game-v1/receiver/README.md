# 男女上衣近、远两套独立游戏包

固定提交 `80fb16b7c6df3a7c85724c757969c6e3e6fb2b2c`，构建 `5859bd00da8b`。主、重建检出均为该提交。正式 review 比较游戏入口可达的 11 项运行文件，SHA-256 `ce30e6f7a5f86a9659aa24101047cb6903e8589ddbd84e84b3c7115e70d1066b` 已进入 externalRecords 登记。[运行审查](../../../scripts/runtime-package/game-record-garment-texture-reviewed.json)

两套包各有 2 个签名角色、41 项 inventory、42 个实际文件（含打包清单）。近包只含两件近距上衣 GLB，远包只含两件 1K 上衣 GLB。两套均核验原记录摘要、骨架适配的目录条目、女性所选上衣的遮罩和每个实际文件的字节数及 SHA。[近包 inventory](near-inventory.json) · [远包 inventory](far-inventory.json) · [实际文件回读](package-readback.json)

| 字节口径 | 近距 | 远距 | 节省 |
|---|---:|---:|---:|
| 双角色选中资源文件并集 | 60,725,141 | 56,774,317 | 3,950,824 |
| 41 项 inventory 含编译代码、签名记录等 | 63,436,301 | 59,485,654 | 3,950,647 |
| 完整 42 文件 | 63,511,956 | 59,561,661 | 3,950,295 |
| 42 文件按 gzip 编码 | 39,077,755 | 35,129,155 | 3,948,600 |
| 42 文件按 Brotli 编码 | 37,958,235 | 34,000,519 | 3,957,716 |

压缩按项目既有规则分别实测 gzip 6、Brotli 5，逐文件解码校验，并对节省不足的文件计原字节。这里测的是离线可传输载荷，实际网络发送和 GPU 分配须独立测量。近包男、女的身体和上衣均有单件纹理超限；远包仅两具身体仍超限。两身的选中 RGBA8 全 mip 估计各下降 16,777,216 B。[近预算](near-budget.json) · [远预算](far-budget.json) · [HTTP 编码规则](../../../scripts/runtime-transfer-http/transport.mjs)

## 固定输入复核

从工程根运行。以下示例使用新的证据与输出路径。已有成功包不能覆盖。独立构建必须位于干净 checkout 的 `prototype/dist`。输入记录由正式制作入口生成，分别读取近、远两组有序 JSON 数组，每个数组含两个身份不同的角色。

```powershell
$primary = 'experiments/worktrees/garment-80fb16b7/prototype/dist'
$checkout = 'experiments/worktrees/garment-80fb16b7-repeat'
$repeat = "$checkout/prototype/dist"
$records = 'evidence/m2-garment-texture-game-v1'
$receiver = 'output/m2-garment-texture-game-v1/repro-receiver'
$packages = 'output/m2-garment-texture-game-v1/repro-packages'
$review = 'scripts/runtime-package/game-record-garment-texture-reviewed.json'
node scripts/runtime-package/review-game-runtime.mjs $primary $repeat $checkout "$receiver/review.json"
if ($LASTEXITCODE -ne 0) { throw 'Independent runtime review failed' }
if ((Get-FileHash "$receiver/review.json").Hash -ne (Get-FileHash $review).Hash) { throw 'Runtime review differs' }
foreach ($mode in 'near','far') {
  $inputFile = "$records/records-$mode.json"
  $inventoryFile = "$receiver/$mode-inventory.json"
  node scripts/runtime-package/game-record-cli.mjs inventory --dist $primary --source-root $checkout --records $inputFile --reviewed $review --out $inventoryFile
  if ($LASTEXITCODE -ne 0) { throw 'Inventory rejected' }
  node scripts/runtime-package/game-record-cli.mjs export --dist $repeat --source-root $checkout --records $inputFile --reviewed $review --inventory $inventoryFile --out "$packages/$mode-package"
  if ($LASTEXITCODE -ne 0) { throw 'Export rejected' }
  $budgetJson = python -B scripts/production/record_budget.py measure $inputFile --source-root $checkout --budget-version m2-technical-v1
  if ($LASTEXITCODE -notin 0,1) { throw 'Budget input invalid or unsupported' }
  [IO.File]::WriteAllText("$receiver/$mode-budget.json", ($budgetJson -join [char]10) + [char]10, [Text.UTF8Encoding]::new($false))
}
node evidence/m2-garment-texture-game-v1/receiver/verify-packages.mjs $records $receiver $packages
```

`--reviewed` 可以核对已登记审查的副本；未登记的新构建须先完成自己的 review 并登记准确摘要。所有收集、签名校验和导出均传同一源码检出。当前 `selected-outfit-v1` 从完整签名读冷启动选装，旧源码缺少该策略时仍计算默认装备和所选装备两套依赖。记录预算独立执行，返回 0 为静态阈值内，1 为实测超限，2 为无效或无支持口径。预算结果不替代运行审查和画面验收。
