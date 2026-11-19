# ROLE-007 双人眼镜原签重放

固定角色源码为 `42063d8ad5009233d669bf4a733111ca2d67a189`。两个独立检出各自构建出 `85520f2e7462`，完整 dist 的 541 个文件、743,249,106 字节逐一相同。普通外部记录包仅收录选定角色的依赖，两次导出得到相同的 42 个文件、44,002,388 字节。包清单 SHA-256 为 `927c41b468a2c9c421f484a63d18d7bcdbca7b55fcb3b1cfc3762f9908dbd521`。[构建比对](dist-comparison.json) · [逐包比对及角色身份](package-comparison.json) · [可重放清单](inventory.json)

输入沿用 60c87f62e8b0 的两条制服原发眼镜记录。用当前普通命令对旧构建回放，仍得到旧清单 `6ffea73b869384bd617be43e2b03f4704b9c6747e7b68fd97b323fae3a7560d8`。新包内两份单人记录也分别与旧独立包的文件逐字相同。新包比旧包多出两份身体唇锚和两份鞋款装备目录 JSON。两位角色仍穿原平底鞋，镜架、各自镜腿和绑定身体 SHA 保留原签。此次新增的审查项只登记到 `externalRecords`。[原签输入](../../m2-uniform-lite-glasses-game-v1/signed-pair.json) · [旧构建审查](../../../scripts/runtime-package/game-record-lite-glasses-reviewed.json) · [新构建审查](../../../scripts/runtime-package/game-record-role-disposal-reviewed.json)

三个失败实测复用同一个空目的地。传入旧构建审查副本得到 `unsupported-build`，男角色记录摘要置零得到 `record-hash-mismatch`，首项资源摘要置零得到 `inventory-mismatch`。每次拒绝后目的地及暂存项均未生成。使用未改动的原签和清单重试，即得到与 A 相同的独立包。此处验证的恢复范围是原签、资源和独立包的重建。角色移除、镜架重挂和关闭重开使用单独的游戏运行回执。[实测命令和结果](export-retry.json)

## 重跑

在主工程根目录运行 PowerShell。以下重建使用新的 B 检出和输出目录。A 是本次保留的独立对照。依赖取自本机前一次已锁定的独立构建，先核对 package-lock，再复制依赖，排除构建缓存。所有临时路径都在项目内。

```powershell
$ErrorActionPreference = 'Stop'
$rev = '42063d8ad5009233d669bf4a733111ca2d67a189'
$a = 'experiments/worktrees/role-disposal-42063d8a'
$b = 'experiments/worktrees/role-disposal-replay-42063d8a'
$donor = 'experiments/worktrees/cross-body-shoes-repeat-da2edab6/prototype'
$out = 'output/m2-role-disposal-v1/replay'
$records = 'evidence/m2-uniform-lite-glasses-game-v1/signed-pair.json'
$cli = 'scripts/runtime-package/game-record-cli.mjs'
$out = python -B -c "from scripts.production.production_paths import project_output; import sys; print(project_output(sys.argv[1],'scripts/character-worktree.py'))" $out
if ($LASTEXITCODE -ne 0 -or (Test-Path $out)) { throw '需要工程内新的输出目录' }
New-Item -ItemType Directory -Path "$out/tmp","$out/npm-cache" | Out-Null
$env:TMP = $env:TEMP = $env:TMPDIR = "$out/tmp"
$env:npm_config_cache = "$out/npm-cache"
$env:npm_config_logs_dir = "$out/npm-cache/_logs"
$env:npm_config_offline = 'true'
python -B scripts/character-worktree.py create role-disposal-replay-42063d8a $rev --runtime-only
if ($LASTEXITCODE -ne 0) { throw '固定检出失败' }
if ((Get-FileHash "$b/prototype/package-lock.json").Hash -ne (Get-FileHash "$donor/package-lock.json").Hash) { throw '依赖锁不同' }
robocopy "$donor/node_modules" "$b/prototype/node_modules" /E /XJ /XD .vite .vite-temp .cache /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw '复制依赖失败' }
npm.cmd --prefix "$b/prototype" run build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
node scripts/runtime-package/review-game-runtime.mjs "$a/prototype/dist" "$b/prototype/dist" $b "$out/review.json"
if ($LASTEXITCODE -ne 0) { throw '构建审查失败' }
node $cli inventory --dist "$b/prototype/dist" --source-root $b --reviewed "$out/review.json" --records $records --out "$out/inventory.json"
if ($LASTEXITCODE -ne 0) { throw '资源清单生成失败' }
node $cli export --dist "$b/prototype/dist" --source-root $b --records $records --inventory "$out/inventory.json" --out "$out/game-package"
if ($LASTEXITCODE -ne 0) { throw '导出失败' }
if ((Get-FileHash "$out/game-package/runtime-package.json").Hash.ToLowerInvariant() -ne '927c41b468a2c9c421f484a63d18d7bcdbca7b55fcb3b1cfc3762f9908dbd521') { throw '清单摘要不同' }
```
