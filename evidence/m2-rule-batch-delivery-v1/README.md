# 同批参数进入普通游戏

直接打开[本地双人录像页](index.html)可观看两段 1 倍速实录。第一段时长 9.48 秒，第二段 33.76 秒，分别来自独立普通游戏和植物房间。4196 的服务代码也已接入同一页。当前在线进程仍展示旧索引，自动审批拒绝了重启操作。[冷开招手录像](cold/dual-external-cold-1x.webm) · [同椅走坐起录像](seat/room-1x.webm)

| 用例 | 已实际验证的范围 |
| --- | --- |
| 两个参数、两名角色 | 同一 CC0 男体下颌端点，权重 0.8125 和 0.1875。在源代码已经冻结的游戏 `60e3934ddd8a` 上，从一份配方清单完成制作、一次签发、普通游戏导出。37 个文件，共 42,816,821 字节；同一对原签记录用另一份固定检出重建，全部文件逐字节一致。[签发回执](receipt.json) · [逐文件比对](rebuild.json) |
| 衣物与角色身份 | 两具身体各有自身的装备和适配清单。相同的上衣、长裤、鞋数据在包内各存一份。检查器根据原配方重新计算身体，同时核对实际游戏文件、两条记录和每件装备的来源。[复算结果](readback.json) |
| 同外观、两名角色 | 同一个 0.1875 配方另签 `equal-look-a`、`equal-look-b`，只交付一个身体数据包，游戏包共 31 个文件。浏览器核对两条独立签名、不同实例及关闭页面后重新打开。[签发回执](equal-look-issuance.json) · [普通游戏回读](equal-look-game/report.json) |
| 冷开和动作 | 两个独立 CfT 145 进程各恢复两名不同下颌角色，每人实际完成招手、回落。移除一人后同伴继续渲染。故意篡改第一具身体的一字节，记录拒绝并在恢复原件后重试。[逐次回执和手腕观测](cold/report.json) |
| 房间实际使用 | 两人先后从房间按钮接近同一座椅，分别走近约 0.853 米和 1.107 米，坐稳后持有租约，各自起身并离开约 0.808 米。合包清单 `120011b9a609`，浏览器 145.0.7632.6。录像中两人穿同款制服，远景脸型差别很小。[座位状态与实际位移](seat/report.json) |
| 失败、重试与输出目录 | 第二个权重 1.125 越界时，回执定位到该角色的身体制作步骤，失败后无目标目录和暂存残留。修正后沿原目录成功。盘根、其他检出、源码目录三种输出在首次写入前被拒绝。[首次失败](rejection.json) · [从盘根的实际检查](path-guards.json) |

## 独立接收方

融合方选定 0.28125 和 0.71875。两件分别用接收方的新签和原签同伴完成生产、普通游戏冷开和房间座位使用。冻结的 555 个运行文件一致。融合方为观察脚本传入了浏览器配置。本工程用已发布的原观察器再次读取其原始角色、游戏和房间，对两件各核四个完成的坐起任务。这两次补测由本工程执行。[独立回执](receiver/received.json) · [本机核对原件](receiver/cross-check.json) · [第一件原观察器复测](receiver/stock-seat-receiver-jaw-orchid/report.json) · [第二件](receiver/stock-seat-receiver-jaw-cedar/report.json)

融合方两件的严格网络检查均收到流式请求取消事件。两件整套正式批准数为 0，普通电脑表现未测。本机这一批的五个物理模型各自处于现有单件技术预算内。两个人的制服文件虽然共用，运行时仍各有实例。物理文件大小、RGBA8 估算和客户端实际显存分别记录。[单件测量、物理包和限制](budget/physical-and-static.json)

整记录预算器新增 `--shape-pack` 后，两份原签均可重新计算完整资源依赖。单人 15,176 个三角形、25 个纹理对象，双人 30,352 个三角形、50 个纹理对象。RGBA8 完整 mip 链的双人估算为 211,115,352 字节，两人分别评估及共同入场均在暂定静态参考值内。引用错误身体、装备或适配回执会被拒绝。无包的旧失败仍可重现。[完整记录预算](budget/record-measure.json) · [命令、旧结果与失败用例](budget/record-measure-checks.json)

## 复跑

整套正式计划已用本批两条原签回放。两人通过标准恢复，9 项选款、拒绝与重试通过。审核索引目前缺这两套的整套证据；已有坐起报告的结构也未满足单人房间审查。两套正式准入仍为 0/2。[正式决定与七项依据](formal/README.md)

在角色制作主检出执行以下 PowerShell 命令。`$fixed` 为源码 `7857eb77d3dbe3b925aa07ff70a99757eab7b104` 的精确检出，固定游戏构建摘要为 `60e3934ddd8aa26294978e9791d9f0d5972f97b7a52905954f8828427d2c3582`。签发使用当前机器已核实的 CfT 配置。使用其他部署时提供与该部署实际文件和锁版本相符的浏览器配置。新输出需使用尚不存在的子目录。用已签原记录重建可比较包字节，重新签发会产生新记录时间。

```powershell
$root = (git rev-parse --show-toplevel).Trim()
$fixed = Join-Path $root 'experiments/worktrees/shape-ext-b-6e858e51'
$dst = Join-Path $root 'output/batch-replay'
$batch = Join-Path $root 'assets-source/rule-body-batch-v1/batch.json'
$cfg = Join-Path $root 'scripts/production/fusion-cft145.json'
node scripts/production/deliver_shape_record.mjs --batch $batch --dist "$fixed/prototype/dist" --source-root $fixed --out $dst --browser-config $cfg
python -B scripts/production/verify_shape_delivery_batch.py --batch $batch --delivery $dst
node scripts/run-fixed-check.cjs "$dst/game" scripts/qa-production-package.cjs "$root/output/batch-cold-replay" --cold-pair "$dst/records.json" --browser-config $cfg
```

数据包覆盖相同模板和三件制服。其他体型、发型、款式、整套正式准入及目标设备各有自己的适配与验收。暂未把这些结果外推到其他角色。
