# 固定游戏版本接收新身体

游戏源码 `7857eb77d3dbe3b925aa07ff70a99757eab7b104`，构建 `60e3934ddd8a`。先冻结引擎，再用同一 CC0 男体下颌模板的权重 0.8125 做内部测试。两个独立构建的 555 个文件逐字节相同。固定资源目录中没有这具身体，编译后的 JavaScript 里也没有它的 ID。[构建比对](fixed-build.json)

| 实际操作 | 结果 |
| --- | --- |
| 在固定游戏上创建新角色 | 未挂包时，D02 返回未知身体，输出文件不存在。挂上 9 文件数据包后，同一请求、同一游戏、同一目的地成功签出 `shape-intake-actor`。 |
| 打包 | 同一运行版本、同一新记录与旧原签分别从两份检出导出，经解压再次比对，33 个文件完全相同。旧签来自 0.625 男体。三件制服 GLB 各存一份，两具身体各有自己的绑定清单。 |
| 普通游戏独立接收 | 从解压目录启动两次全新 Chrome。核对实际 HTTP 读取的索引、配方、适配回执、身体、装备和角色记录。两次均恢复两人和各自的三件衣物，两人依次招手。移除新角色后，旧角色继续渲染，并可从普通加载按钮恢复整组。 |

[1 倍速录像，8.76 秒](cold/published-and-previous-1x.webm) · [实际浏览器报告](cold/report.json) · [制作拒绝记录](without-pack.json) · [两条原签](records.json) · [独立游戏 ZIP](../../output/m2-frozen-rule-game-v1/ordinary-60e3934ddd8a.zip)

录像为 1280 × 800 的开发机 Chrome 157 实录。左侧新角色使用 0.8125，右侧保留 0.625 原签。两个参数使用同一身制服，这段录像验证既有游戏能接收新几何。两项外观在这个距离的视觉差异很小。证据覆盖这份男体模板、下颌修改、制服上衣、长裤及平底鞋。新身体的走坐接触、整套正式审批、普通电脑性能和接收方自选参数均另行验收。[影片解码](media.json) · [包摘要](delivery.json) · [正式准入的拒绝原因](formal/README.md)

## 接收 Agent 的单命令入口

该命令已从 F 盘根实跑。输入原始配方、稳定角色身份和冻结游戏的两个路径即可生产。可选的同伴参数接受一条原签角色 JSON。首次产物均放入指定的工程内新目录；已有目录受保护。先以本次输入复跑，再让独立接收方自行修改配方中的 `weight`，取一个该游戏从未内置的有效权重。下文的测试复用了 0.8125，仅代表内部重复生产。

```powershell
$root = 'F:/gamemake'
$ev = "$root/evidence/m2-frozen-rule-game-v1"
$fixed = "$root/experiments/worktrees/shape-ext-b-6e858e51"
node "$root/scripts/production/deliver_shape_record.mjs" --recipe "$ev/input/recipe.json" --id shape-intake-actor --name 数据包角色 --gender male --dist "$fixed/prototype/dist" --source-root $fixed --companion "$ev/input/previous.json" --out "$root/output/m2-frozen-rule-game-v1/receiver-replay"
```

两次生产的 9 个数据文件逐字节相同。复跑保留了旧角色的原签名；新角色的最终外观相同，重新签发产生新的创建时间与签名。普通包只有新角色记录、记录清单、包清单这三个文件随之改变。接收方取 `game/` 目录部署，其他输出保留用于复核。[实际单命令回执](single-command.json)

普通读取的两条原签均已用发行校验器复核。实际运行 9 项选款检查，包括同件衣物错身体、错摘要、资源暂不可读和恢复后重试。新包缺少必要报告、换上衣后沿用旧报告、沿用其他构建的报告均分别实测拒绝。[两次普通读取](restore/report.json) · [失败保旧与重试](guards/report.json) · [正式校验函数回读](formal/standard-restore-guards-replay.json)

## 独立游戏回读

在工程中打开下列 PowerShell 命令，临时 HTTP 服务随验收结束关闭。使用新的工程内证据目录。独立游戏端可以仅部署解压得到的静态文件，打开 `record-consumer.html?records=/records/manifest.json`。制作端指纹和配方随本报告保存。

```powershell
$root = 'F:/gamemake'
$ev = "$root/evidence/m2-frozen-rule-game-v1"
$meta = Get-Content "$ev/delivery.json" -Raw | ConvertFrom-Json
node "$root/scripts/run-fixed-check.cjs" "$root/output/m2-frozen-rule-game-v1/extracted" "$root/evidence/m2-first-rule-delivery-v1/game/check-cold.cjs" $meta.manifest "$ev/records.json" "$root/output/m2-frozen-rule-game-v1/cold-replay" --published $meta.indexSha256 "$root/evidence/m2-first-rule-delivery-v1/game/signed.json"
```

融合方可在上述游戏版本上独立选择另一个合法参数。保留其选择、身体摘要、数据包摘要、角色记录和游戏回读回执，单独计入独立接收结果。

从全新工作区复建时，先取本项目包含制作工具、模板、源模型和评审的完整 Git 检出。安装支持仓库测试的 Python、NumPy、Node、npm 和 Chrome。下列命令准备冻结游戏，再把上文的 `$fixed` 指向新建的工作树。临时文件和 npm 缓存均位于制作工程内。

```powershell
$root = (Get-Location).Path
python -B scripts/character-worktree.py create external-shape-game 7857eb77d3dbe3b925aa07ff70a99757eab7b104 --runtime-only
if ($LASTEXITCODE) { throw '创建固定游戏检出失败' }
$fixed = Join-Path $root 'experiments/worktrees/external-shape-game'
$tmp = Join-Path $root 'output/fixed-build-cache/external-shape-temp'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$env:TEMP = $tmp
$env:TMP = $tmp
$env:TMPDIR = $tmp
$env:npm_config_cache = Join-Path $root 'output/fixed-build-cache/npm'
Push-Location "$fixed/prototype"
try {
    npm.cmd ci
    if ($LASTEXITCODE) { throw '依赖安装失败' }
    npm.cmd run build
    if ($LASTEXITCODE) { throw '构建失败' }
} finally { Pop-Location }
```

如需复原录像里的确切签名与游戏内容，在单命令生产结束后复用其中的 `shape-pack` 和本目录保存的 `records.json`。两步读同一份运行评审，清单摘要应为 `e23bcf09f2561176886bf3763ffe8f6f5050bf84bb7c98dc2e628db44a54b988`。

```powershell
$work = "$root/output/m2-frozen-rule-game-v1/receiver-replay"
$cli = "$root/scripts/runtime-package/game-record-cli.mjs"
$argsForRecord = @('--dist', "$fixed/prototype/dist", '--source-root', $fixed, '--records', "$ev/records.json", '--shape-pack', "$work/shape-pack")
node $cli inventory @argsForRecord --out "$work/original-inventory.json"
if ($LASTEXITCODE) { throw '原签清单核对失败' }
node $cli export @argsForRecord --inventory "$work/original-inventory.json" --out "$work/original-game"
```
