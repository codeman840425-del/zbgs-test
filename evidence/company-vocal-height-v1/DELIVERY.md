# 可调唱麦、谱架与两间唱播房

固定源码 `ce534b0e67b658b578d243d3c09497a36ec10d65`，构建 `aed783000987`。工作室与出租屋各有标准位和低位快照。同一房间的两个快照共用公司、设施和唱播槽身份。空闲时可切换麦架高度，麦网和口眼参考一起更新，底座、容量、进场和退出位置保留。

[工作室原速操作，7.88 秒](browser/singing-studio-height-normal.webm) · [出租屋原速操作，8.00 秒](browser/singing-rental-height-normal.webm) · [工作室标准位](browser/singing-studio-standard.png) · [工作室低位](browser/singing-studio-low.png)

## 制作与复产

- [正式包](../../company-workspace/deliveries/vocal-height-v1/README.md)含两个可编辑房间、两档麦架、谱架、原料与许可、生产工具和运行文件。清单 SHA-256 为 `7d502e930194ea8c115ad95461f13749a406fbf373696a5ef4315f3f37879e9d`。包内 `node verify.mjs . 清单SHA` 实检 2,336 个文件；独立接收方按锁文件离线安装、重建，643 个运行文件逐字节一致。[接收回执](receiver.json)
- 接收方把谱面与边框的净距从 6 毫米改为 8 毫米，只替换低位工作室的谱架。保存重开后，重复发布和冲突拒绝均保留原文件。另一份配方从独立演唱帧 f06 制作出唇缘上方 18 毫米的麦架，发布到新的资源身份，在两间房里切换并恢复。原固定包继续使用原有规格。[麦架发布回执](new-mic/publication.json) · [新麦架两房复验](new-mic/two-rooms.json) · [制作与批量命令](../../docs/research/COMPANY-VOCAL-HEIGHT-HANDOFF.md)

## 实际检查

- 低位的实体麦网中心下降 16.44 厘米。两房全部 38 个签名历史姿势通过整套检查。28 个低位采样里，首个命中的麦网表面高于唇缘 1.04 至 2.45 厘米，低于眼部参考至少 5.62 厘米。[口眼及谱架实测](face-and-score.json)
- 两页谱面共 19,760 个网格采样、1,520 个最下行采样及 17,100 个实体谱线采样全部可见。旧工作室男角曾有 201/901 帧的右瞳被麦网挡住；出租屋换低麦后沿用旧机位也会遮挡右瞳。两房最终机位按实体障碍选定，在四组各 901 帧的历史轨迹中，共 10,812 条从镜头到双瞳及唇缘的射线通过。[镜头与反例](camera.json) · [原始采样出处](../../assets-source/company-vocal-height-check-v1/CAMERA.md)
- 两房在浏览器中经过标准→低→标准→低，关掉浏览器再打开，存档字节一致。测试另验了预载失败、预载期间开始占用，以及试图用普通外观替换改变拾音规格时保留原场景与存档。[改档及失败恢复](height-changes.json) · [浏览器报告](browser/report.json) · [录像逐帧复核](browser/recording-probe.json)

## 总工接收

前版固定公司包为 `64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc`。在新包使用 `node check-vocal-origin.mjs singing-studio-low 新包SHA 原包目录 原包SHA singing-studio --height-profiles` 可直接读取档位、实际麦架资源、口眼和原槽的进退位置。出租屋使用 `singing-rental-low` 和 `singing-rental`。标准位使用不带 `-low` 的房键。投入真实角色前，由宿主把预约、占用和退出接入既有忙碌查询。

本次验收包括独立重建、设施浏览器操作和历史实测轨迹的几何重放。新游戏合包仍须由总工验证真实角色行动、交接、占用恢复、同伴或角色自身遮挡以及人物受光。普通电脑性能与最终人类观感待验。

## 保留的失败

早期候选生成自定义麦架时，发布器读取了超出作用域的配方变量；另一候选在面板同步末尾重新显示了应隐藏的外观控件。回执保留原身份。正式源码分别修复了配方读取和控件显示。首次终版录像中，出租屋末帧早于已完成的保存反馈，上方链接采用同一固定构建重新录制的两段原片。[发布错误](before/custom-publication.txt) · [控件断言](before/appearance-control.json) · [旧几何对照](before/face-and-score.json) · [版本与文件摘要](identity.json)
