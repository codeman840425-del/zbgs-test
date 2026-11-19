# ENV-015 唱播谱面遮挡修正

工作室原先能发布一份背景板遮住右页的存档。演唱者仍看得到两页中心，却看不到右页的部分谱线。原双房包和原五房包都复现了这个问题。两套 v1.1 都在批量生成、编辑和封包时拒绝原始反例，并指出页号、页内位置、遮挡实例和网格。[同眼位对照](browser/original-and-obstructed.png) · [8.16 秒原速录像](browser/video/score-eye-normal.webm)

| 固定交付 | 清单 SHA-256 | 已核文件 |
| --- | --- | --- |
| [唱播双房 v1.1](../../company-workspace/deliveries/singing-rooms-v1.1/README.md) | `a73a9c41ee20c42bbd8defd969bcda754c22ab65d3d35f980238eb77832c3873` | 2107 |
| [四类五房 v1.1](../../company-workspace/deliveries/theme-live-rooms-v1.1/README.md) | `16b51582db1029580af6697c935c1346b6e9a80c24cf1bc18785e03cabbc963a` | 2125 |

固定源码为 `4348adeabb4d1518a25d362a65468f017edd8e78`。两包分别按锁文件安装、重建并核对，595 个查看器文件逐字节相同。布置、模型和查看器沿用 `66de2c6a46fc`，生产校验器的版本由源码提交和各包清单确定。所有具名房间及默认房的原布局和存档也与各自上一版字节相同。[重建回执](rebuild.json)

### 已验结果

- **实际看到了什么。** 独立检查从演唱者眼位向每页投射 121 个样点。原工作室和出租屋每页都无遮挡。加入品牌板后，右页 42 个样点先碰到板，左页仍为 0 个。右页外侧的真实谱线和纸面色带均有首次命中证据。这是样点数量。原图和历史坏档用同一眼位拍摄，关闭浏览器重开后坏档画面逐像素相同。[独立实物测量](cpu/visibility.json) · [浏览器回执](browser/report.json) · [媒体核对](browser/media-review.json)
- **生产校验改了什么。** 每页实际检查 260 个点，其中 225 点位于从实物几何提取的浅凸谱线带。原反例首先报右页外端，页内横向位置 92%，第一处遮挡为 `edge-sight-panel / background-surface`。低 45 毫米的另一款真实谱架、整体平移及转 90° 的房间均复验。保留宽高各 5% 的纸边和原有中心阅读角距规则。有限采样之间的细小遮挡仍可能漏检。[制作规范及算法范围](../../docs/research/COMPANY-SINGING-ROOM-PRODUCTION.md)
- **失败后能否继续。** 两个新包分别检查了批量重试、正常编辑、存档校验、默认房封包和具名房封包。五种调用均给出右页、原板实例和 `singing-score-occluded`，原产物保全。删除或移开同一块板后，均可编辑、重封包并在新进程读回。浏览器仍可打开历史存档供比对，正式重新发布须通过新检查。[双房回执](fixed/dual.json) · [五房回执](fixed/theme.json) · [旧双房](legacy/dual.json) · [旧五房](legacy/theme.json)

### 复跑

从项目主目录执行。命令中 `$work` 为独立工作副本，已按该包的 `source/prototype/package-lock.json` 安装依赖。复跑输出目录必须是新目录，上一级须存在。五房可换用对应的正式包、工作副本和新的输出名。

```powershell
$pack = 'company-workspace/deliveries/singing-rooms-v1.1'
$work = 'company-workspace/production-trials/singing-score-receiver-v1/dual'
$tools = "$work/source/scripts/company-platform"
$bad = 'evidence/company-singing-score-visibility-v1/inputs/historical-obstructed.save.json'
node "$pack/verify.mjs" $pack a73a9c41ee20c42bbd8defd969bcda754c22ab65d3d35f980238eb77832c3873
node "$tools/test-singing-score-ingress.mjs" $pack $work output/singing-score/replay-dual
node "$tools/qa-singing-score-view.cjs" $pack 66de2c6a46fc $bad output/singing-score/replay-browser --record
```

此次修正覆盖静态布置和生产发布。三件器材的角色使用点仍为空。真人接近并使用房间麦架、争用及冷恢复需与总工的角色链在共同固定版本验收。录像使用 Chromium 软件渲染，普通电脑性能待实测。
