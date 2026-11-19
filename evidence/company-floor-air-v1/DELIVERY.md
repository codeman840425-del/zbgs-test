# 直播房落地风扇与净化器

固定源码 `87681dc4a6747a7a38c1f7a5d5f6cc4025437791`，查看器构建 `7255eee31b85`，正式包在项目内 `company-workspace/deliveries/floor-air-v1`。可从接收包复产四款设备，再用独立配方登记第五款、布置房间和重新交付。[制作与复跑说明](../../docs/research/COMPANY-FLOOR-AIR-PRODUCTION.md) · [接口与文件身份](identity.json)

[两房和四款设备](browser/rooms-and-four-looks.jpg) · [22.32 秒原速录像](browser/video/floor-air-normal.webm) · [五款造型对照](cpu/five-models.png)

民房和出租屋使用相同的安装、电源与三档风速合同。塔扇、立柱扇、循环扇和净化器逐款换入房间、断电保存并关闭浏览器后重新打开。外露叶轮一档约 1.57 弧度/秒，三档约 4.71 弧度/秒。断电后叶轮静止、四灯熄灭，重新供电恢复已选档位。两款外露叶轮复用了 Kenney 的 CC0 几何。此包覆盖设施显示、布置、保存和复产。浏览器验收使用软件渲染。[几何导出](cpu/export.json) · [场景检查](cpu/report.json) · [浏览器回执](browser/report.json) · [媒体核验](browser/media-review.json)

接收方按锁文件复建，615 个查看器文件与正式包逐字节相同。独立发布的宽面塔扇有 21 片横向导流叶，第二间房换用后保留地面接触、朝向和位置，另一间房六个具名文件及默认存档保持原字节。相同 ID 和版本改宽被拒绝。原包校验 2,190 项，派生包校验 2,189 项。[独立重建](cpu/independent-build.json) · [独立发布与派生包回执](receiver/report.json)

首次放置出租屋循环扇挡住东侧房门，沿墙移开后只需重跑这一份输入。几何预检另发现了一个上移 15 毫米却仍在包络内的输入，现由真实底面三角的接触检查拒绝。首次独立接收脚本对比规范化前后的 JSON 字节出现误报，修正后从最终检出重新运行整链。已编辑的房间按完整结构和值核对，旁边的房间仍逐字节核对。[初次摆放回执](cpu/initial-door-obstruction.json) · [最终接收报告](receiver/report.json)

在正式包内运行以下命令核对文件集合。原始运行报告中的候选路径已按此哈希归档至上述正式位置。

```powershell
node verify.mjs . a855f730e8d9ccc6a51b687d43e7333240b2406d681d7df1f5f7761383849375
```
