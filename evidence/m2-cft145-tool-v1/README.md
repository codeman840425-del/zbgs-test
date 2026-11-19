# 用接收方指定的浏览器制作与回读

接收方可固定制作工具提交 `9c72d4fdc5402ba2f5bf5441ec2713ad9c0e2d50`，让 `--source-root` 仍指向游戏源码 `7857eb77d3dbe3b925aa07ff70a99757eab7b104` 的独立检出，`--dist` 仍指向该检出的 `prototype/dist`。两者承担不同职责，可以分别固定。没有重签旧同伴。

接收方在旧工具的预检中发现，签发入口会选择系统 Chrome。公开制作入口现可传入 `--browser-config scripts/production/fusion-cft145.json`。工具在制作前核对该部署的绝对路径、实际可执行文件摘要及 Playwright 锁定版本；启动后核对实际浏览器版本。无效或冲突的显式配置终止本次命令。临时浏览器配置、下载和录像暂存在运行制作工具的工程内。配置只覆盖本次核实的 Windows 部署。[受审部署](../../scripts/production/fusion-cft145.json)

从 F 盘根启动，用**公开样本** 0.8125 和既有 0.625 男体原签，在冻结游戏 `60e3934ddd8a` 签出、生成 9 文件身体包和 33 文件普通包。实际采用 Chrome for Testing 145.0.7632.6、Playwright 1.58.2，浏览器可执行文件 SHA-256 `ff0c99fc5bb2301cad77930aa76e5354cf2a5fefb7efdcf3b3bc10ba0550c015`。标准恢复及九个选装与失败重试用例通过。接收方自选样本的结果另记。[签发及工具身份](receipt.json) · [普通游戏恢复](restore/report.json) · [九项守卫](guards/report.json)

**功能回读和网络测量得出了不同结果。** 两次全新 CfT 145 进程均加载同一对原签并播放招手，首次会话另检查移除新体、保留旧体、重新选组。严格网络检查仍返回失败，保留原始请求编号及错误。最小复现对同一 VRM 的两次流式读取和一次整块读取分别核对页面实际收到的 12,141,256 字节和 SHA-256。三次均匹配。CfT 145 对两次流式请求报告 `net::ERR_ABORTED`，整块读取返回可计量的完成事件；本机 Chrome 157 三次都有完成事件。没有给 145 缺少的传输统计补数。冻结游戏继续使用原读取方式。[两次完整冷开与逐请求状态](cold-cdp-complete/report.json) · [正常速度录像](cold-cdp-complete/published-and-previous-1x.webm) · [145 对照](stream145.json) · [157 对照](stream157.json)

## 重放入口

独立的游戏功能检查 `--cold-pair` 在两次新进程分别保留旧同伴并通过页面按钮恢复原签。另将真实 VRM 响应的最后一字节从 0 改成 1；游戏指出该身体的摘要不符，场景零人，恢复原响应后同一对原签再次入场。严格网络核查继续保留失败。[真实进程、单字节拒绝和原地恢复](functional-cold-pair/report.json)

座椅入口也支持同一部署文件。公开样本的普通包与已审核的植物房间 v1.1 组合，包摘要 `700759cf26e3f535f668799089344024610d8f151cb589137b75a44f10707ff6`。两条原签经页面按钮分别走近 0.853 米和 1.107 米，坐稳后都起身离开约 0.808 米。34.04 秒影片已完整解码。给该入口传入未授权的部署文件时，连验收目录都没有创建。[同房间坐起 1×](seat/room-1x.webm) · [控制与接触回执](seat/report.json) · [错误配置](seat-negative.json)

按[原交付命令](../m2-frozen-rule-game-v1/README.md)选择固定游戏、配方、人物身份和旧签名，在命令末尾追加 `--browser-config` 及部署 JSON 的**绝对路径**。独立检出中使用本检出的脚本，证据和产物落入该制作主工程。保留独立选择的配方值。成功签发后，在下列命令中使用新的工程内证据目录。

```powershell
$p = (Get-Location).Path
$cfg = Join-Path $p 'scripts/production/fusion-cft145.json'
$issued = Join-Path $p 'output/m2-cft145-tool-v1/issued'
$r = Get-Content "$issued/receipt.json" -Raw | ConvertFrom-Json
node scripts/run-fixed-check.cjs "$issued/game" scripts/qa-production-package.cjs "$p/output/cft-restore-replay" "$issued/records.json" --browser-config $cfg
node scripts/run-fixed-check.cjs "$issued/game" scripts/qa-production-package.cjs "$p/output/cft-pair-replay" "$issued/records.json" --cold-pair --browser-config $cfg
node scripts/run-fixed-check.cjs "$issued/game" evidence/m2-first-rule-delivery-v1/game/check-cold.cjs $r.packageManifestSha256 "$issued/records.json" "$p/output/cft-cold-replay" --published $r.shapePack.indexSha256 evidence/m2-frozen-rule-game-v1/input/previous.json --browser-config $cfg
```

上述实测只覆盖该浏览器和这两份记录。普通机性能、正式发行、独立融合样本仍有各自的验收。

带椅子的独立回放使用 `scripts/production/package-facility-room.mjs` 产生受审组合，然后执行下列命令。`$room` 是该次组合的输出路径，`$roomSha` 是它返回的 manifestSha256。这里的两人功能检查覆盖一个外置新身体及一个旧原签同伴。

```powershell
node scripts/run-fixed-check.cjs $room evidence/m2-frozen-rule-game-v1/room/check-seat.cjs $roomSha "$issued/records.json" "$p/output/cft-seat-replay" --browser-config $cfg
```
