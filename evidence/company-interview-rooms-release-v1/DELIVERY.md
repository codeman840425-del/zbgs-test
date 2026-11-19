# 双人访谈直播间

[10.68 秒原速录像](browser/video/interview-rooms-normal.webm)依次展示工作室全景、双人机位、主持椅换款和酒店访谈间。点房间工具栏的 **机位取景**，看到的是从已安装镜片向前看的画面；点 **房间全景** 可以继续选物和摆放。[工作室换椅重开后的画面](browser/interview-studio-cold-open-actual-lens.png) · [酒店实机位](browser/interview-hotel-original-actual-lens.png) · [原速抽帧](browser/video-review.png)

两间房都用独立的座椅、桌麦、茶几与相机桌。工作室的北门直通室外，酒店房的南门通向 16 房楼层的中央走廊。实体检查从同一台相机分别射向两个坐面，确认首个命中的是目标椅，并读取两席各自的接近、退出和起身空间。每条入座路线预留 0.50 米宽、1.90 米高。酒店用了另一组座椅和麦克风、相反的镜头方向和独立饰面。[两房的可编辑输入](../../scripts/company-platform/batch-inputs/interview-rooms.json) · [静态实测及拒绝用例](production/interview-checks.json) · [原包浏览器回执](browser/report.json)

| 交付物 | 查看器构建 | 净包文件 | 清单 SHA-256 |
|---|---|---:|---|
| [正式双房包](../../company-workspace/deliveries/interview-rooms-v1/README.md) | `4ed3d907dc9d` | 2067 | `6c41c9de200e21f121836f40526b916f5d29d38b8d146b6baa15d19b649b54c0` |
| [接收方酒店改版](../../company-workspace/production-trials/interview-receiver-v1/validated/hotel-edited/README.md) | `4ed3d907dc9d` | 2061 | `4d5a97dca16f55f1db14ff249cc04211c3976da885786dc4a87cac331ccd7fe1` |

两包使用相同游戏查看器，清单分别固定各自的房间内容。源码提交为 `9b1f50dc2296c47aa4bbd0575051941efce53965`。接收方用包内锁文件和全新的空 npm 缓存联网安装，重建的 591 个查看器文件与正式版逐字节一致。接收方把酒店主持椅换成梯背椅、杯子换成笔记本与笔；酒店其余 15 房、7 个公共区及另一席的配置保留。独立工作室六个数据文件逐字节一致。跨房借椅、错分桌麦、遮挡机位都在相应的生产或重打包入口被拒绝，改正后可以只重跑酒店房。[接收、重建与改款回执](receiver/report.json) · [成品文件哈希](receiver/viewer-hashes.json)

## 复跑

同一酒店机位的接收前后截图可以并排观看。主持席的支座、椅背和前景桌上的物件都能辨认；工作室、走廊和实体机位仍是原配置。[酒店改款前后实景](receiver/hotel-camera-before-after.png) · [实际图像与存档对照](receiver/comparison.json) · [完整文件校验值](identity.json)

在项目根目录运行以下命令。独立接收脚本会下载锁定的 npm 依赖，请给它选择新的试制和回执目录。可在独立交付包的可写副本使用相同的制作与检查入口。[制作字段与坐标约定](../../docs/research/COMPANY-INTERVIEW-ROOM-PRODUCTION.md)

```powershell
$pkg = 'company-workspace/deliveries/interview-rooms-v1'
$pin = '6c41c9de200e21f121836f40526b916f5d29d38b8d146b6baa15d19b649b54c0'
node "$pkg/verify.mjs" $pkg $pin
node scripts/company-platform/test-interview-room.mjs
node scripts/company-platform/qa-interview-rooms.cjs $pkg 4ed3d907dc9d output/interview-replay-browser --record
node evidence/company-interview-rooms-release-v1/receiver/receive.mjs $pkg company-workspace/production-trials/interview-replay $pin output/interview-replay-receiver
```

首轮真实机位画面裁掉了酒店两把椅子的外缘，扩大取景范围后复测。公共入口厅曾误显示机位按钮，修正了工具栏的可见条件。[原始裁边画面](diagnostics/cropped-seats.png) · [按钮诊断](diagnostics/irrelevant-camera-control.json) · [修复后的公共厅](browser/interview-hotel-public-area.png)

本包检查静态座面、设施间关系和通路，录像来自 Chromium 软件渲染。真人双席入位、头肩构图、坐起与占用及普通电脑表现仍待验证。
