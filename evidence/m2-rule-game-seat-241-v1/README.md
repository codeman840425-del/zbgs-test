# 从角色配方直接交付可使用椅子的普通游戏

制作工具 `da782fba`，游戏源码 `bc42048f`，游戏构建 `241ce1c278f0`。本轮在 F 盘根发起制作，新建角色使用已封存的男性下颌配方。版本管理保存代码和机器回执；游戏包、原速录像及逐帧坐标保存在主工程本地。

第一次拼接时，固定游戏缺少座椅协议登记，公开打包器拒绝，未留下成品目录。核对 11 个已审运行文件，并重放原房间和座椅 CPU 用例后，仅为这一构建补记 `seat-v1`。原始游戏审查文件哈希仍为 `67b231000a46…`。[开发侧源码与 CPU 核查](source-review.json)

在同一目的地重试后，公开命令产出 37 文件普通游戏和 600 文件设施游戏，两个目录的文件均经逐项哈希复验。用新浏览器进程打开后，两名角色向同一椅子分别接近约 0.85 米和 1.11 米，在各自入座时持有座位，离座时均已释放，退出位移均约 0.81 米。第二人坐稳时被前景同伴部分遮挡，这段远景不足以评价局部接触质量。设备为开发机，浏览器 CfT 145.0.7632.6，录像 1280×840。[33.6 秒原速录像](../../output/m2-rule-game-seat-241-evidence-v1/room-1x.webm) · [完整游戏运行回执](../../output/m2-rule-game-seat-241-evidence-v1/report.json) · [版本、签名、文件和录像摘要](development-run.json)

## 复跑

在有原工具依赖、固定游戏构建、浏览器部署及公司房间交件的电脑执行下列 PowerShell。可以从任意当前目录运行。输出目录须为主工程 `output` 下未使用的新名称。单个新增角色需要一份已签同伴，也支持一个含两条配方的批次。此房间包接受已审座椅场景；其他设施需要各自的运行协议。

```powershell
$repo = 'F:/gamemake'
$fixed = "$repo/experiments/worktrees/bitmap-owner-a-bc42048f"
$room = 'F:/gamemake-company-platform-c1/company-workspace/deliveries/desktop-plants-v1.1'
$game = "$repo/output/replay-seat-241"
$browser = "$repo/scripts/production/fusion-cft145.json"
$companion = "$repo/evidence/m2-rule-image-lifecycle-v1/public-batch-b/input-record.json"
$pack = "$repo/output/m2-rule-batch-delivery-v1/pair/shape-packs/877f3740d9aeaca5205757829693d71691130a5e4d08c3d4178edf25572328d7"
node "$repo/scripts/production/deliver_shape_record.mjs" --recipe "$repo/evidence/m2-frozen-rule-game-v1/input/recipe.json" --id operator-room-seat-a --name '座椅验证 A' --gender male --dist "$fixed/prototype/dist" --source-root $fixed --companion $companion --companion-pack $pack --facility-room $room --out $game --browser-config $browser
if ($LASTEXITCODE) { throw '角色交付失败，参见上一行输出' }
$delivery = Get-Content -Raw -Encoding UTF8 "$game/receipt.json" | ConvertFrom-Json
node "$repo/scripts/run-fixed-check.cjs" "$game/facility-game" "$repo/evidence/m2-frozen-rule-game-v1/room/check-seat.cjs" $delivery.facility.manifestSha256 "$game/records.json" "$repo/output/replay-seat-241-recording" --browser-config $browser
```

工作台和固定游戏依赖的重建方法可沿用[交接说明](../m2-rule-image-lifecycle-v1/operator-handoff.md)。此次端到端测试直接使用新游戏包，临时本地服务随验证关闭。

## 接收方的历史失败

融合方用原有工具独立复验了 Orchid 的配方制作、签发和普通游戏冷开，1/1 通过。Orchid、Cedar 两组的位图释放与画面严格一致性合计 0/2，反向卸载时各出现过 1 个像素、1 个色阶差异。此前采集器会在画面断言处提前退出，部分最后离场的位图因此缺少记录。

新版在同一帧增加无上传重绘及隐藏后复原，保留原始基准帧和原阈值，分别报告资源释放和画面结果。用只读 Cedar 包进行一次开发复跑，两次新进程分别完整记录 92 张位图各关闭一次。四组重传的原位图、原句柄和像素均通过。这次未再现接收方的间歇差异，不能据此更改融合的原判。普通电脑和整套造型的发行审核仍待验。[开发实测原表](../../output/m2-rule-image-cedar-control-v1/report.json) · [接收方原报告](F:/gamemake-test/native-studio-round/independent/studio-20-admission/bitmap-6ad10a1d/REPORT.md)
