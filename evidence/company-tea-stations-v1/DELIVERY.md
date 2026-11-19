# 公共茶水站双房交付

项目内正式目录为 `company-workspace/deliveries/tea-stations-v1`。源码固定在 `35338ceffe38d33be65c9f4c33226f86baa21234`，原包构建为 `5301d1b046ba`。在正式包内运行以下命令可核对 2,151 项文件，清单及派生包身份见 [identity.json](identity.json)。

```powershell
node verify.mjs . 1306f59e9a6a90f0a83c2d7225c20e439e628e7d41c7b6ed4945c554279e0696
```

出租屋公共客厅和十六间房的平层使用同套设施。柜有饮水服务柜、储物茶柜、咖啡吧台、开放搁架四种实物造型。暖启动换款、保存及四次关闭浏览器后恢复均通过。机器吸附柜面，杯子坐落在机器托盘上，台前与走廊两端保留通路。十三个错误输入各自被拒绝，原八个批次文件保持原字节。[CPU 验证](cpu/report.json) · [浏览器验收](browser/report.json) · [走廊与茶站](browser/tea-floor-along-passage.png) · [23.76 秒原速录像](browser/video/tea-station-rooms-normal.webm)

独立副本按锁文件安装后重建，607 个查看器文件逐字节一致。接收方用公开配方重新制作第五款加宽搁板，替换出租屋茶柜，打开机灯，把同一只杯子移到柜面并重新封包。再次打开后，杯子可以放回机器托盘。另一间房的六个文件保持原字节，派生包的 2,150 项完整核对通过。固定浏览器使用软件渲染，角色取杯和真实机器出饮留待相应玩法与联调。[独立重建](cpu/rebuild.json) · [接收方实测](receiver/report.json) · [复跑命令](../../docs/research/COMPANY-TEA-STATION-PRODUCTION.md)

首次固定检出发现 Git 转换了原稿换行，导致来源哈希不符。最终源码保留登记时的字节并重新通过源重导、资源库和双房验证。原始回执在归档前生成，其中的 `output/tea-station/candidate-v1` 已按同一清单移至上述正式目录。
