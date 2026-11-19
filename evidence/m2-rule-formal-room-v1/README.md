# 外置身体的正式单人房间回读

源码 `4becd8e49fb668f34b27a316f5e03ae6ec6e7e58` 的两份独立构建共有 555 个相同文件。普通游戏包共 37 个文件，42,819,284 字节。新浏览器加载、独立招手、保留另一名角色、错误数据拒绝和重新载入均已运行。工作台录像另行验证具体座位和衣物。[构建和游戏包摘要](build-and-package.json) · [普通游戏双人录像](ordinary-cold/dual-external-cold-1x.webm) · [两次冷开回执](ordinary-cold/report.json)

要复建，先运行 `python -B scripts/character-worktree.py create formal-room-replay 4becd8e49fb668f34b27a316f5e03ae6ec6e7e58 --runtime-only`。在生成的 `prototype` 目录执行 `npm ci` 和 `npm run build`，将 npm 缓存及进程的 TMP、TEMP、TMPDIR 指向制作工程内目录。还可用 `scripts/qa-fixed-rebuild.py`，传入相同提交、第一份 dist、另一个工程内新工作树和新证据目录进行逐文件复核。按[原批次命令](../m2-rule-batch-delivery-v1/README.md)重新制作两份身体数据包。逐字节复建当前普通游戏时，使用[已归档的两份原签](../m2-rule-batch-delivery-v1/records.json)，重新签发会产生新时间。使用本版本 dist、干净源码检出和这两条原签运行 `game-record-cli.mjs inventory` 和 `export`，每次都传入两套 `--shape-pack`。固定审查器会在输出前执行主工程工作树巡检。

两条原签在新候选工作台 `f90136db446c` 上均通过正式单人动作校验。固定源码为 `4becd8e49fb668f34b27a316f5e03ae6ec6e7e58`；完整编译输入的复算摘要为 `f90136db446c1f3c6a45b2e75bbbf9848d767422c079cb444a207bb69f399f45`。CfT 145.0.7632.6 分别载入两套身体和三件装备。两人的独立任务均按走、坐、起、走完成；两段步行的净位移约为 0.633 米和 4.052 米。坐下、起身及离开后，同一座椅租约依次为占用、退出、释放。两次关闭页面重开后均恢复原签，人物和头骨实例均已更新。[正式校验及八个拒绝结果](formal-verification.json) · [A 原速录像](public-batch-a/room-produced-1x.webm) · [B 原速录像](public-batch-b/room-produced-1x.webm)

每条实报均实际重放四项负例。移除坐下任务 ID、替换目标构建、提交另一条签名或换成另一体的装备 ID，均被同一校验器拒绝。报告、录像及对应 SHA 可用于这个新构建的正常速度动作证据。整套正式准入、人工观感和普通机性能继续按各自条件核验。

冻结构建 `60e3934ddd8a` 的两个入口各有一项实际限制。工作台首次载入人物时直接通过 `foundationProfile(bodyType)` 查找模型。对这两条原签，对应的两个身体在初始目录中均返回 `Unknown foundation body type`。同一冻结模块显式读取已经复算的数据包后，能解析出两条原签的准确身体摘要。普通设施房支持这一步，亦实际播放过坐起；其控制器收到独立 `walk` 请求时则明确返回 `unsupported-facility-behavior`。静止到座位、起身离开的行走阶段分别属于 `sit` 和 `stand` 任务。[固定源码复跑与 SHA](frozen-capability.json) · [可执行检查](frozen-capability.mjs) · [冻结版实际坐起](../m2-rule-batch-delivery-v1/seat/report.json)

新的单人房间入口须在第一次载入人物前读取受信 `/records/rule-body-data.json`。带 `--rule-body-data` 的采集器只通过页面查询参数选择此产品入口。它在初次打开和关闭后重开时均核对实际初始身体、三件装备、已着装项目及实例，在两页中都恢复同一份原签。四项任务用已有工作台控制器执行，回执逐一保存真实请求 ID、主人、起终位置、占座和释放时的同一租约。[采集入口](../../scripts/qa-production-record-room.cjs)

从项目根执行以下命令。`$dist` 指向新候选独立重建的完整工作台目录，`$verifiedDigest` 取该候选固定重建回执中的完整 64 位源码摘要。每个输出目录须是工程内新目录。两具身体可依次采集。

```powershell
$root = 'F:/gamemake'
$pair = Join-Path $root 'output/m2-rule-batch-delivery-v1/pair'
$cfg = Join-Path $root 'scripts/production/fusion-cft145.json'
$receipt = Get-Content -Raw (Join-Path $pair 'receipt.json') | ConvertFrom-Json
$packs = @($receipt.items | ForEach-Object { '--shape-pack'; Join-Path $pair $_.shapePackPath })
foreach ($item in $receipt.items) {
    $id = $item.identity.id
    $recordFile = Join-Path $pair "game/records/$id.json"
    $destination = Join-Path $root "evidence/m2-rule-formal-room-v1/$id"
    node scripts/run-fixed-check.cjs @packs $dist scripts/qa-production-record-room.cjs $recordFile $destination --rule-body-data --record-id $id --record-sha256 $item.recordSha256 --build-sha256 $verifiedDigest --browser-config $cfg
    if ($LASTEXITCODE) { throw "房间采集失败 $id" }
}
```

使用新构建时保留其自身摘要。该构建的单人报告只能送入同一构建的正式审核。原版 `60e3934ddd8a` 的普通游戏录像、两人座椅回执及既有整套拒绝结果继续保留各自版本。[原版正式审核](../m2-rule-batch-delivery-v1/formal/README.md)

两份录像齐后可执行 `python -B evidence/m2-rule-formal-room-v1/verify.py --fixed-root $fixedRoot --digest $verifiedDigest`。该入口核对固定检出的 Git 身份与全部编译输入，按新版本校验每个原签、实际装扮、四项请求和释放的租约，并重放缺少任务 ID、错误运行、另一份原签和错误装备四种拒绝。[验证脚本](verify.py)
