# 环境平台第一轮整改交付

| 交付项 | 固定值 |
| --- | --- |
| 环境问题 | ENV-004，桌面设备的完整占地与入口一致性 |
| 制作工具源码 | `9b46d74ea5c3bcb08da1d22df4a0a33f68123695` |
| 正式接收包 | `company-workspace/deliveries/mouse-pad-v1.1` |
| 场景构建 | `e7c6ce2ec11d` |
| 场景源码摘要 | `e7c6ce2ec11d0108ccf597dfd33ae8b54e731d5c6bcf6b08c05f6530d1f34fa3` |
| 移交清单 SHA-256 | `d7e1fde3bf8c642ffc5bb09512858ab248ff51515fcff5f73adc1ce5dc208d00` |

**修订原因。** 初版批次允许把鼠标垫压在键盘上，编辑器会拒绝同一摆位。初版实际生成的不合格存档和报告均已留存。四款桌面样件的有效占地随朝向旋转，桌沿按整个使用区域校验。v1.1 让批量生产、交付包的 `edit.mjs validate/apply`、默认房间及具名房间打包复用编辑器的实际几何检查。无编辑依赖时，净包会提示在工作副本安装锁定依赖的命令。[原错误存档](before/invalid-save.json) · [初版接受报告](before/accepted-batch-report.json) · [修后拒绝与失败保旧](cpu/rejected-rooms.json)

**版本边界。** v1 固定在 `company-workspace/deliveries/mouse-pad-v1`。v1.1 更新制作工具及随包验收脚本、说明与制作来源报告。前后两个包的 527 个运行文件以及双房的布局、存档、座面回执逐字节一致。有效旧房间可直接读取，已有不合格房间需要改正占地后重新发布。原包和原存档可单独保留。[新旧对照](cpu/versions.json) · [固定身份](identity.json)

**接收方结果。** 封存包校验 1805 个文件。接收方以锁文件从空依赖目录安装，在同一试制工作区核对全部修订输入，再重建 527 个运行文件及双房 8 个批次文件，逐字节相同。合法摆放、相邻键盘、旋转桌沿和失败保旧共 9 项编辑命令检查通过。固定两房四款经浏览器实际加载、移动、替换和冷开，记录 10 项检查。接收方用随包配方生产第五款并独立打包，构建 `5b226c1b5a72`，1807 个文件通过校验。[接收回执](receiver/report.json) · [编辑正反例](receiver/edit-commands.json) · [原速录像，13.08 秒](browser/mouse-pad-normal.webm) · [接收方第五款](receiver/fifth-connected.png)

**复现。** 在正式包根目录执行第一条命令。在另存的试制副本根目录执行其余命令，验收结果写入该副本。浏览器检查需有 Playwright 对应的 Chromium。

```powershell
node verify.mjs . d7e1fde3bf8c642ffc5bb09512858ab248ff51515fcff5f73adc1ce5dc208d00
npm ci --prefix source/prototype
node source/scripts/company-platform/test-mouse-pad-installation.mjs
node source/scripts/company-platform/test-mouse-pad-offline.mjs viewer offline-check
node source/scripts/company-platform/qa-mouse-pad-rooms.cjs . e7c6ce2ec11d browser-check --record
```

**正式角色联调输入。** 固定合同另附于本回执，已封存的鼠标包与旧座面包均按原清单交接。用 `seat-contact-v1` 的 `textile-rental` 读取同一真实沙发的 `textile-rental/ground/rest/sofa#left` 和 `#right`。各点容量 1，分别提供世界坐标、接近点、退出点及真实座面和靠背网格。独立 Node 进程已核实恢复相同公司布局后可重读两个使用点，且存在外部忙碌守卫时编辑会被拒绝。正式角色系统仍需以完整 `payload.usePointId` 验证同位争用、异位并发、离位释放、按角色与任务重建占用。软件渲染录像用于功能验收。普通电脑表现和正式角色接触由融合测试另验。[固定输入](use-points/seat-input.json) · [双位回执](use-points/verified-round2/receipt.json) · [复现命令](use-points/README.md)
