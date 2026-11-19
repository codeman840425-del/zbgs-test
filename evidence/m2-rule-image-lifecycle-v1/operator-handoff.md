# 阶段一接收操作

从一份新的公开下颌配方出发，保留已签角色 B 作为同伴。固定制作工具生成身体及适配数据、通过 D02 签出新角色，并导出两名角色的普通游戏包。随后用新浏览器进程从包里读回两条签名，最后在同一固定运行版本的工作台为新角色录制走、坐、起、走离。下方 `0.5625` 是可直接采用的公开示例输入，本交接未用它重跑制作或录像。[同版公开样本的实测片单](README.md#待审片单)

## 固定输入

| 输入 | 使用的位置与约定 |
| --- | --- |
| 制作与采集工具 | 完整工具 Git 检出 `6ad10a1d1808d483c9d58e5a326041d955161871`，含实际源模型、已锁定的 `prototype/package-lock.json` 和工作台脚本。下文在接收方自己的制作主检出根执行，输出保留在其 `output/`。本机已用 Node `24.13.0`、Python `3.13.11` / NumPy `2.4.2`、锁定的 Playwright `1.58.2`。首次准备如缺依赖，须在该工具检出及固定游戏检出分别安装 `prototype` 锁定依赖，临时目录和 npm 缓存留在制作主工程。 |
| 固定游戏和完整工作台 | 源码 `bc42048fcf63c4d55c1c5fd80b4e1679307af8d3`、构建 `241ce1c278f0`、完整源码摘要 `241ce1c278f0229e341b553246b9f9da31df550641f160e40d8b5be2b062cbb0`。本机现成检出为 `experiments/worktrees/bitmap-owner-a-bc42048f`，完整 `dist` 位于其 `prototype/dist`，与制作检出分开。全新接收目录可用 `python -B scripts/character-worktree.py create bitmap-owner-a-bc42048f bc42048fcf63c4d55c1c5fd80b4e1679307af8d3 --runtime-only`，安装锁定依赖后执行 `npm run build`；也可取得经同版校验的完整 `dist`。`--source-root` 仍需对应的干净 Git 检出。D02 及房间采集需要完整 `dist`。 |
| 新配方和原料 | [公开配方格式](../../assets-source/rule-body-recipe-v1/candidate.json)的模板路径和 SHA 原样保留，修改 `weight` 为 `[0,1]` 内的数值；选择区别于 B 的参数，以便用双外置身体冷开入口。工具检出内的[模板](../../assets-source/rule-body-recipe-v1/template.json)锁定 1K 身体、归档的 Blender 下颌端点 `assets-source/m2-male-face-v1/generated/source-delta.json.gz` 和[旧源声明](../../assets-source/foundation-male/source.json)。三件原制服的来源和版本由工具按模板与[适配规则](../../scripts/production/rule-outfit-templates.json)读取。正常例无需下载新素材、打开 Blender 或编辑游戏源码。 |
| 同伴 B 的原签和数据包 | 使用本版单人报告旁的[`public-batch-b/input-record.json`](public-batch-b/input-record.json)，其原签 SHA 为 `01f6c12f8f06ad40956f2e18ddc2815d772ca49eb40005f6df75c62ce2ab32db`。可从[公开原签数组](../m2-rule-batch-delivery-v1/records.json)取同一记录，保持内部签名字段完整。本机已有的独立身体包目录见下方 `$companionPack`，索引 SHA 为 `877f3740d9aeaca5205757829693d71691130a5e4d08c3d4178edf25572328d7`。若未带这一目录，公开原配方可以复建，原签无需重发。 |
| 受审浏览器 | [固定 CfT 配置](../../scripts/production/fusion-cft145.json)要求已安装的 CfT `145.0.7632.6`、可执行文件 SHA-256 `ff0c99fc5bb2301cad77930aa76e5354cf2a5fefb7efdcf3b3bc10ba0550c015`，并核对实际启动版本及锁定 Playwright。冻结工具同时核定该配置中的绝对安装路径，接收方须核实哪台机符合这一前置。 |

固定运行评审已经随工具发布。公开的两条原签控制包清单 SHA 为 `0d3edadf098d99d985a816adccdaa7a97895498f6c7da3006cd849cdafa5e392`，本机位于 `output/m2-rule-image-release-build-v1/game`；新签名生成后，应使用本次 `receipt.json` 的清单 SHA。普通包可由接收方静态 HTTP 提供，也可使用下方一次性本机服务。[运行评审](../../scripts/runtime-package/game-record-bitmap-owner-reviewed.json) · [公开控制包摘要](build-and-package.json)

## 最短执行路径

在已准备好上述输入的 Windows 制作主检出根运行。`$run` 须是工程内尚不存在的目录；浏览器命令按顺序运行，报告和录像均在该目录。路径相对自身接收工作区，使用本机不同的固定游戏检出时只需调整 `$fixed`。

```powershell
$root = (git rev-parse --show-toplevel).Trim()
Set-Location -LiteralPath $root
$toolCommit = '6ad10a1d1808d483c9d58e5a326041d955161871'
$sourceCommit = 'bc42048fcf63c4d55c1c5fd80b4e1679307af8d3'
$buildSha = '241ce1c278f0229e341b553246b9f9da31df550641f160e40d8b5be2b062cbb0'
if ((git -C $root rev-parse HEAD).Trim() -ne $toolCommit) { throw '须在固定制作工具检出根执行' }
$fixed = Join-Path $root 'experiments/worktrees/bitmap-owner-a-bc42048f'
$dist = Join-Path $fixed 'prototype/dist'
if ((git -C $fixed rev-parse HEAD).Trim() -ne $sourceCommit) { throw '固定游戏源码不匹配' }
if ((Get-Content "$dist/build-info.json" -Raw | ConvertFrom-Json).sourceDigest -ne $buildSha) { throw '固定游戏构建不匹配' }
$cfg = Join-Path $root 'scripts/production/fusion-cft145.json'
$run = node --input-type=module -e 'import {productionRoot,projectOutput} from "./scripts/project-output.cjs"; console.log(await projectOutput(process.argv[1],await productionRoot()));' (Join-Path $root 'output/stage-one-operator')
if ($LASTEXITCODE) { throw '接收输出路径不合法' }
if (Test-Path -LiteralPath $run) { throw '请选新的工程内输出目录' }
New-Item -ItemType Directory -Path $run | Out-Null
$recipe = Join-Path $run 'recipe.json'
$delivery = Join-Path $run 'delivery'
$companion = Join-Path $root 'evidence/m2-rule-image-lifecycle-v1/public-batch-b/input-record.json'
$companionIndex = '877f3740d9aeaca5205757829693d71691130a5e4d08c3d4178edf25572328d7'
$companionPack = Join-Path $root "output/m2-rule-batch-delivery-v1/pair/shape-packs/$companionIndex"

[IO.File]::WriteAllText($recipe, '{"schema":"shape-endpoint-body-recipe-v1","template":{"path":"assets-source/rule-body-recipe-v1/template.json","sha256":"b16bcf65656083085032d534bab3285bf401608905b784e86fff4eaa79978ad7"},"weight":0.5625}', [Text.UTF8Encoding]::new($false))

# 只在接收方未持有 B 的数据包时，从公开的原配方复建这份精确旧包。
if (!(Test-Path -LiteralPath "$companionPack/index.json")) {
    $oldRecipe = Join-Path $root 'assets-source/rule-body-batch-v1/lower-jaw.json'
    $oldModel = Join-Path $run 'companion-model'
    $companionPack = Join-Path $run 'companion-pack'
    python -B scripts/production/rule_body_producer.py --recipe $oldRecipe --out $oldModel
    if ($LASTEXITCODE) { throw '同伴身体复建失败' }
    python -B scripts/production/shape_data_pack.py build --recipe $oldRecipe --candidate "$oldModel/body.vrm" --out $companionPack
    if ($LASTEXITCODE) { throw '同伴数据包复建失败' }
}
if ((Get-FileHash "$companionPack/index.json" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $companionIndex) { throw '同伴索引不匹配' }

# 1. 从新配方制作并自动登记，签发新角色，保留旧原签，导出可独立运行的普通包。
node scripts/production/deliver_shape_record.mjs --recipe $recipe --id stage1-public-new --name '公开形参交接示例' --gender male --dist $dist --source-root $fixed --companion $companion --companion-pack $companionPack --out $delivery --browser-config $cfg
if ($LASTEXITCODE) { throw '签发或导出失败' }
$issued = Get-Content "$delivery/receipt.json" -Raw | ConvertFrom-Json
if ((Get-FileHash "$delivery/game/runtime-package.json" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $issued.packageManifestSha256) { throw '导出包摘要不匹配' }

# 2. 仅服务本次普通包，在两个干净进程读回两条原签并逐人招手。
node scripts/run-fixed-check.cjs "$delivery/game" scripts/qa-production-package.cjs "$run/cold" --cold-pair "$delivery/records.json" --browser-config $cfg
if ($LASTEXITCODE) { throw '普通游戏冷开失败' }

# 3. 对同版完整工作台挂载新身体包，用新原签执行走、坐、起、走离和关闭重开。
node scripts/run-fixed-check.cjs --shape-pack "$delivery/shape-pack" $dist scripts/qa-production-record-room.cjs "$delivery/character.json" "$run/room" --rule-body-data --record-id $issued.identity.id --record-sha256 $issued.recordSha256 --build-sha256 $buildSha --browser-config $cfg
if ($LASTEXITCODE) { throw '同版单人房间采集失败' }
```

留存 `$recipe`、`delivery/shape-pack/`、`delivery/character.json`、`delivery/records.json`、`delivery/receipt.json`、`delivery/game/runtime-package.json`、`cold/report.json`、`room/report.json` 和对应两段 1× 录像。第一步已经用受审运行版执行依赖收集和普通包导出，游戏从 `record-consumer.html?records=/records/manifest.json` 取数据。第三步使用同版工作台里的实际房间控制器，回执有四项任务、占座及释放和关页重开；它需要完整工作台 `dist`。需要让普通包也进入公司设施房时，合包及座位协议另有运行版本审核。旧版普通设施房已经实测过走近坐下和起身离开，应保留其版本与证明范围。[旧版设施房实测](../m2-rule-batch-delivery-v1/seat/report.json) · [当前同版单人房间证据](two-rooms.json)

## 已知边界

- 自选合法权重通过现有生成和数据包路径，无须按新 `bodyType` 更新产品代码。此前两次独立结果来自接收方自选参数及原签同伴，使用工具 `9c72d4fd` 与游戏 `60e3934ddd8a`。两份均通过普通冷开和房间使用，严格传输仍失败。它们提供独立接收先例，本页 `241ce1c278f0` 的公开实测使用归档 A/B 原签。[接收方原回执](../m2-rule-batch-delivery-v1/receiver/received.json) · [同版待审片单](visual-review-playlist.json)
- `6ad10a1d` 的单人房间 `--rule-body-data` 强制 `--browser-config`。共同启动器会核对规范化后的绝对路径及受审配置。现配置固定在 `F:/gamemake-test/formal-round/combination/tools/browsers/chromium-1208/chrome-win64/chrome.exe`。在该部署已经可用的机器上，配方、引擎和工具皆可原样运行。其他安装路径即使二进制相同，当前正式房间采集也会拒绝，需要新增受审部署支持。D02 和普通冷开可省略 `--browser-config` 使用当地已安装的系统 Chrome，保留实际浏览器身份。[房间参数门](../../scripts/qa-formal-room-record.cjs) · [部署验证](../../scripts/qa-browser-workspace.cjs)
- D02 签出和普通包导出的回执状态是 `technical-package-exported`，整套准入仍为 `not-evaluated`。公开演练、普通机验收、严格网络验收、人工观感及来源权属分别保留事实；身份、权属和本轮独立验收由融合方单独登记。本操作不建立任何审批凭据。[待审条件](pending-signoffs.md) · [既有正式拒绝及复跑](../m2-rule-batch-delivery-v1/formal/README.md)
