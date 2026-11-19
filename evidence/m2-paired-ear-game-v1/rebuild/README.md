# 原男女 3.0 mm 双耳钉独立游戏复建

角色源 `e01413e3a763ee4552fc225bd791a2d5ebd16666` 的两个干净检出分别完成离线构建，683 个输入重算得到 `3c15a020d62a`。完整 dist 的 545 个文件、743,272,606 字节逐件一致。普通角色消费页的审核覆盖 11 个入口依赖，回执 SHA 为 `5f91b044ad0839916cc3df801ff0e5f47953bd3f020e4717065023fbe6effd1a`，已登记至 `externalRecords`。[构建对照](dist-comparison.json) · [审核文件](../../../scripts/runtime-package/game-record-ear-style-reviewed.json)

同一对浏览器签名在 A、B 两个独立运行来源分别经普通 inventory、export。每包 48 个文件、76,285,057 字节逐件一致，含清单本身。包清单 SHA 为 `02b5def86e2af426195190dd4b8b3221a997ce03fa432ce51dac5456ca4b2ed2`。男女各有本体的 fit，两份签名都选择左右双侧；两人共用一个 6,436 字节的 GLB。实包耳饰目录只含款式清单、一个 GLB 和两份 fit，原款耳饰、帽、手持麦克风及眼镜素材均未装入。项目原创 CC0 范围限耳钉几何，制作方配方、作者和许可的路径与字节摘要已随模型写入 inventory。运行审核和角色技术签名各自记录，正式造型准入另行验收。[原签](../signed.json) · [清单](inventory.json) · [双导核验及所用制作工具摘要](package-comparison.json)

B 在同一空目标先后遇到错误运行审核、保持 JSON 可解析且等长的错误男 fit、缺失男 fit，分别返回 `unsupported-build`、`modified-dependency`、`missing-dependency`。三次均无目标或暂存残留。恢复原男 fit 字节后在同一位置成功导出，与 A 完整一致。[实际命令、错误与恢复](export-retry.json)

## 工程内重跑

从主工程根用 PowerShell 运行。例中复用本次 A 树作为对照，B 新建为 replay；制作方目录需含本次外部审核以及配套耳饰来源登记、配方和许可，其准确文件摘要见包对照。npm 复用锁定依赖，本地构建缓存另建。

```powershell
$ErrorActionPreference = 'Stop'
$rev = 'e01413e3a763ee4552fc225bd791a2d5ebd16666'
$a = 'experiments/worktrees/ear-style-a-e01413e3'
$b = 'experiments/worktrees/ear-style-replay-e01413e3'
$donor = 'experiments/worktrees/role-disposal-b-42063d8a/prototype'
$records = 'evidence/m2-paired-ear-game-v1/signed.json'
$cli = 'scripts/runtime-package/game-record-cli.mjs'
$out = python -B -c "from scripts.production.production_paths import project_output; print(project_output('output/m2-paired-ear-game-v1/replay','scripts/character-worktree.py'))"
if ($LASTEXITCODE -ne 0 -or (Test-Path $out)) { throw '需要工程内新的重跑目录' }
New-Item -ItemType Directory -Path "$out/tmp","$out/npm-cache" | Out-Null
$env:TMP = $env:TEMP = $env:TMPDIR = "$out/tmp"
$env:npm_config_cache = "$out/npm-cache"
$env:npm_config_logs_dir = "$out/npm-cache/_logs"
$env:npm_config_offline = 'true'
python -B scripts/character-worktree.py create ear-style-replay-e01413e3 $rev --runtime-only
if ($LASTEXITCODE -ne 0) { throw '固定检出失败' }
if ((Get-FileHash "$b/prototype/package-lock.json").Hash -ne (Get-FileHash "$donor/package-lock.json").Hash) { throw '依赖锁不同' }
robocopy "$donor/node_modules" "$b/prototype/node_modules" /E /XJ /XD .vite .vite-temp .cache /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw '依赖复制失败' }
npm.cmd --prefix "$b/prototype" run build
if ($LASTEXITCODE -ne 0) { throw '游戏构建失败' }
node scripts/runtime-package/review-game-runtime.mjs "$a/prototype/dist" "$b/prototype/dist" $b "$out/review.json"
if ($LASTEXITCODE -ne 0) { throw '运行审核失败' }
node $cli inventory --dist "$b/prototype/dist" --source-root $b --records $records --reviewed "$out/review.json" --out "$out/inventory.json"
if ($LASTEXITCODE -ne 0) { throw '清单生成失败' }
node $cli export --dist "$b/prototype/dist" --source-root $b --records $records --inventory "$out/inventory.json" --out "$out/game-package"
if ($LASTEXITCODE -ne 0) { throw '导出失败' }
if ((Get-FileHash "$out/game-package/runtime-package.json").Hash.ToLowerInvariant() -ne '02b5def86e2af426195190dd4b8b3221a997ce03fa432ce51dac5456ca4b2ed2') { throw '游戏包清单摘要不符' }
```
