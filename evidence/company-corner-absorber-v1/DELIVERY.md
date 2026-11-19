# 墙角吸声件在唱播间和带货出租屋的安装、换装与恢复

两间房复用同一套三角毡面、槽纹圆柱、分片和布艺软包。角件宽 0.35 米、高 2.20 米、深 0.35 米。安装由父房间、角名和底高决定，四款共用两侧承托和导航占地。换款保留实例身份、角位和高度。批量配置、普通文件加载和人类预览共用这些规则。[生产配方和操作示例](../../assets-source/company-corner-absorber-v1/README.md)

| 观看或复验 | 入口 |
| --- | --- |
| 唱播间四款，左键试拖到服务门处，再拖到合法角位 | [唱播间原速录像](browser/corner-studio-normal.webm) |
| 带货出租屋四款，选角改挂、切换墙体显示、保存 | [出租屋原速录像](browser/corner-rental-normal.webm) |
| 两面墙实测、空角可用与穿插拒绝 | [安装测量](installed-geometry.json) · [普通制作命令实测](agent-cli.json) |

**房间里的实际表现。** 预览把四个真实角位标在锁定视图上，用户可拖放，也可从安装位置列表选角。唱播间的西侧服务门和出租屋的南窗分别切断一面支撑。错误落点、错误布局文件和隐藏楼层的非法编辑均有诊断，原场景和已保存结果保留。两层角件跟随各自房间的旋转。剖切一面支撑墙时角件仍显示，两面都被剖切才隐藏。[房间与恢复](rooms.json) · [两房操作报告](browser/report.json)

**素材和挂载检查。** 生产工具复用了项目已有的壁架托臂、织物与蜂窝毡源件。每侧墙轨取九个实测点核对网格与对应内墙。真实陶杯放在三角芯以外的空隙时可以摆放，穿进主体会被拒绝；把托轨压入踢脚线也会被拒绝。初次浏览器检查发现自动剖切同时隐藏了角件和两面墙；修复后由相同观看入口复验。[原问题画面](cutaway-before.png) · [修复后四角拖放](browser/corner-studio-drag-rejected.png) · [四款及五片试制的几何检查](model-geometry.json)

**独立复验。** 固定源码为 `7d3b1537cf19e33b976e099530ee7addacc505b2`，构建为 `cc8b7321cb59`。接收者用空 npm 缓存安装依赖并重建，705 个查看器文件与固定包逐字节一致。接收者自行将分片款改为五片、四条 56 毫米缝，使用普通发布命令生成新版本，原三片版继续可用。接收副本的编辑命令也能识别背景板穿入托轨并保留原存档。[重建与复产回执](receiver/receipt.json) · [独立编辑命令](receiver/ordinary-edit.json) · [固定版本信息](identity.json)

在正式包目录运行 `node serve.mjs 0`，打开终端打印的地址并附上 `?delivery=corner-studio` 或 `?delivery=corner-rental`。批量输入、源配方和回归脚本随包提供。在带锁定依赖的源码检出，可用以下命令对原包再次验收，最后一个路径使用新的项目内输出目录。

```powershell
node scripts/company-platform/qa-corner-absorber.cjs F:/gamemake-company-platform-c1/company-workspace/deliveries/corner-absorber-v1 38a995d6a6d7064ce13965f69af94dbd284fa261173b3f453fd89b5ed725d33a F:/gamemake-company-platform-c1/output/corner-browser-recheck --record
```

本包验证静态布置与观看，录像使用浏览器软件渲染。声学效果、普通电脑性能和真实角色 C3 联调均未在本包测量。出租屋里，原有陈列架在当前取景下遮住柱状角件的一部分下段。两房录像均为正常速度，分别为 22.56 秒和 21.48 秒。[录像核验](browser/recording-probe.json) · [接收版五片件冷开](receiver/browser/corner-rental/corner-rental-restored-corner-absorber-segmented-v2.png)
