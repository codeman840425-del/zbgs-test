# 唱播工作室与出租屋

两间房共用一支落地悬臂麦和一副三脚谱架。6 × 6 米工作室有独立外门，4.5 × 4 米出租屋的东门连接客厅。点「机位取景」可看实际镜头，选中谱架点「聚焦物品」可看清两页谱纸。录像由固定版本以原速录制，时长 16.88 秒，1600 × 900，25 fps。[录像](browser/video/singing-rooms-normal.webm) · [出租屋谱架近景](browser/singing-rental-original-score-focus.png)

正式交付包的源码提交为 `92ee6e91297b58965c7917a6926755d80f9bad71`，查看器构建为 `ab04bb1928d6`。清单 SHA-256 为 `135b0b92a87692e49df4d23b509c499037b9ea9738f2d3b270a599fb3e7f011c`。接收方核对全部 2097 项，按锁文件重新安装依赖，595 个查看器文件逐字节重建一致。[正式交付](../../company-workspace/deliveries/singing-rooms-v1/README.md) · [身份与哈希](identity.json)

两种器材基于 Grab3D 的 CC0 模型，随包提供可编辑原稿、源许可、配方和导出工具。实际模型检查覆盖三脚着地、麦夹接触、参考口位到麦网的距离、双页谱面可见性、相机到站位的视线及入场通道。工作室和出租屋口位到麦网分别约 12.0 和 14.0 厘米。浏览器复验覆盖换相机、存档和重开。真人演唱、拾音及普通电脑表现仍待对应环节实测。[制作说明](../../assets-source/company-singing-stage-v1/README.md) · [两房测量](production/rooms.json) · [封包浏览器验证](browser/packaged-report.json)

另一位 agent 在接收副本逐件发布了自己的麦克风和谱架，保留原工作室实例身份。复读封存模型测得拾音轴转动 2.000067°、左右谱页均下降 45 毫米。出租屋的存档和布局逐字节相同。派生包构建为 `b7acc91ab9ce`，2110 项全部通过清单复核，两房另经浏览器打开验证。[派生包](../../company-workspace/production-trials/singing-receiver-v1/r1/derived/README.md) · [独立接收回执](receiver/report.json) · [派生浏览器回执](receiver/derivative-browser.json)

试制时发现两个实际缺口。旧制作器要求两件器材一起登记，旧版出租屋近景被背景板完全挡住。正式入口支持单件发布，修复后在原布局一次点击能看到两页谱纸。首次辅助冷读从没有安装依赖的封存目录启动失败，随后从已按锁安装、同源码的工作副本启动，读回的存档和模型取自封存目录。[旧版单件诊断](receiver/legacy-single-design.json) · [原近景](diagnostics/hidden-score.png) · [首次冷读记录](receiver/baseline-studio-cold-failed.json)

在项目主目录执行下列命令。独立接收测试会安装锁定依赖，需要新的可写试制目录。

```powershell
$bundle = 'company-workspace/deliveries/singing-rooms-v1'
$pin = '135b0b92a87692e49df4d23b509c499037b9ea9738f2d3b270a599fb3e7f011c'
node "$bundle/verify.mjs" $bundle $pin
node scripts/company-platform/test-singing-room.mjs output/singing-room/replay-data
node scripts/company-platform/qa-singing-rooms.cjs $bundle ab04bb1928d6 output/singing-room/replay-browser --record
node evidence/company-singing-rooms-release-v1/receiver/receive.mjs $bundle company-workspace/production-trials/singing-room-replay $pin
```
