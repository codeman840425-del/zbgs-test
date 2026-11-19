# 同一份款式配方在男女角色上的游戏交付

[从头同时播放男女两段房间录像](index.html)。两段均在 `4959572f6d5e` 拍摄，各约 17 秒，包含走向椅子、坐下、起身和离开。第三段约 8.5 秒，显示独立游戏同时读取两人的记录并播放待机和讲话。[录像文件身份与解码时长](films.json) · [播放器实测](playback.json)

制作端收到一个款式号、一个版号、两个基模和角色身份，选出女体第 5 套、男体第 1 套。女装使用 252 个躯干遮罩三角形，男装使用自己的版型和覆盖配置。两条记录在前一游戏构建首次签名，本版按原签名读取。男女套装各含上衣、裤、鞋。玩家关闭后重新进入，两人的身份、造型和对应资源均恢复。[制作请求](../../assets-source/variant-matrix-v1/uniform-lite-top-request.json) · [实际生产计划](../m2-uniform-lite-operator-v1/plan/plan.json) · [独立游戏回读](pair-game/report.json)

| 游戏构建与实包 | Chrome for Testing 145.0.7632.6 | Chrome 157.0.8103.79 |
|---|---|---|
| 旧构建 `f4966554bcfc`，相同男体、原上衣／轻量上衣 | 两包首次进入均报告动作响应中止 | 两包首次进入和重开均通过 |
| 新构建 `4959572f6d5e`，同一对旧签男体记录 | [原上衣](after-145-near/report.json)和[轻量上衣](after-145-far/report.json)各通过两轮 | [原上衣](after-157-near/report.json)和[轻量上衣](after-157-far/report.json)各通过两轮 |
| 新构建，男女制服独立记录 | [首次进入和重开通过](after-145-pair/report.json) | [首次进入和重开通过](after-157-pair/report.json) |

两浏览器、同一 7,618,436 字节的 UAL 动作文件，只有 145 的包装流读法产生了 CDP 中止事件；四次试验均读到了相同 SHA。游戏现在只对该动作库直接取原响应，核对 SHA 后为每具人物独立解析骨架。新构建检查自然时钟、动作和原始骨骼随时间前进。源文件中解析到 43 个片段，冷开实际播放范围为待机和讲话。旧版 145 的有效失败样本位于 `before-145-near-r2` 和 `before-145-far-r2`；无 `-r2` 的两份回执是命令参数错误，发生在浏览器启动之前。[对照与归因](DIAGNOSIS.md) · [新构建重建回执](rebuild.json)

九个换装检查包括错身体、错上衣、记录损坏、两人各自收到一次 HTTP 503、换回原衣及关闭重开。失败时保留角色及同伴的原装备。[逐项结果](pair-guards/report.json)

融合团队用同一 Chrome 145 可执行文件独立复建本版。三包 86 个成品文件一致，6 次冷开、8 个角色阶段读到完整动作响应。该团队在真实公司环境的 5 次入座调用仍遇到 `target.requestBehavior is not a function`。本页房间录像使用样板内的座位控制；正式设施接缝沿既有 LINK-001 跟踪，仍须贯通真实使用点、预约、离座和释放。角色侧只读核对了 [融合独验回执](<F:/gamemake-test/native-studio-round/independent/motion-intake/RECEIPT.md>) 和[真实使用点失败样本](<F:/gamemake-test/native-studio-round/official-pair/motion-response-4959572f6d5e/evidence/plant-home-01/native-roles-and-seat.json>)。

**预算与范围。** 双人包共 34 个文件。两人选中的资源合计估算 209,367,384 字节 RGBA8 含 mip，落在本轮暂定静态预算内。Windows、RTX 4090、Ryzen 9 9950X3D、Chrome 157、1440×1000 下分别短测 12 秒待机／讲话。女、男、双人刷新间隔 p95 均为 6.2 ms，最大分别为 30.2、36.4、6.6 ms。该测量关闭录屏；录像使用另一轮采样。普通电脑、公开发行许可和正式套装准入仍待验证。两套当前均为内部技术候选，发型和颜色采用原版。[静态成本](pair-static-budget.json) · [开发机三组原始时序](browser-budget/report.json) · [正式计划的拒绝记录](../m2-uniform-lite-operator-v1/formal/plan.json)

## 交给游戏制作 Agent

交付单分别固定制作工具 `9b55bd9a` 和运行源码 `2ad612c2`，入口为 `record-consumer.html?records=/records/manifest.json`。4196 单独提供人工预览。新的接收方从含本回执的主工程启动，下面的目录均位于工程内。若已有这两份精确检出与对应 dist，可复用。[交付单](../../delivery/character-production-handoff.json) · [工程内临时目录版工具的 34 文件复验](../character-worktree-relocation-v1/operator-scratch-handoff.json) · [首版工具回读](verified-handoff.json)

```powershell
$out = 'output/replay-495-uniform'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
$env:TEMP = (New-Item -ItemType Directory -Path "$out/tmp").FullName
$env:TMP = $env:TEMP
$env:npm_config_cache = (New-Item -ItemType Directory -Path "$out/npm-cache").FullName
python -B scripts/character-worktree.py create replay-495-game 2ad612c2 --runtime-only
python -B scripts/character-worktree.py create replay-495-tools 9b55bd9a --runtime-only
$game = 'experiments/worktrees/replay-495-game'
$tools = 'experiments/worktrees/replay-495-tools'
git -C $game sparse-checkout add scripts assets-source/garment-basecolor-release-v1
git -C $tools sparse-checkout add scripts
npm --prefix "$game/prototype" ci
npm --prefix "$game/prototype" run build
$e = 'evidence/m2-motion-response-compat-v1'
$dist = "$game/prototype/dist"
$signed = 'evidence/m2-uniform-lite-operator-v1/records.json'
node "$tools/scripts/runtime-package/game-record-cli.mjs" export --source-root $game --dist $dist --records $signed --inventory "$e/pair-inventory.json" --out "$out/pair"
node scripts/runtime-package/verify-character-handoff.mjs --operator-root $tools --runtime-root $game --dist $dist --package "$out/pair" --handoff-root .
```

复测接收方原有男体记录，可按下面的命令用指定 Chrome 检查近、远两个独立包。每包启动一次临时回环服务，两轮冷开结束即关闭。首次使用当前主工程的浏览器脚本需按 `prototype/package-lock.json` 安装其依赖。

```powershell
$old = 'evidence/m2-cc0-body-release-game-v1'
$exe = (Get-Content "$e/after-145-near/report.json" -Raw | ConvertFrom-Json).executable
foreach ($tier in 'near','far') {
    $other = if ($tier -eq 'near') { 'far' } else { 'near' }
    node "$tools/scripts/runtime-package/game-record-cli.mjs" export --source-root $game --dist $dist --records "$old/$tier-records.json" --inventory "$e/$tier-inventory.json" --out "$out/$tier"
    node scripts/run-fixed-check.cjs "$out/$tier" scripts/qa-garment-cold-package.cjs 4959572f6d5e "$old/$tier-records.json" "$old/$other-records.json" "$out/145-$tier" "$exe"
}
```
