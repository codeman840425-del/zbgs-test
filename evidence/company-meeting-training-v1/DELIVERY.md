# 公共会议培训区交付

固定源码 `5064191687c3b022df8bd1d52e7b4d26f8f19f73`，查看器 `1e249616bbb3`，清单 SHA-256 `ca5bca3b24a8876750625db68300e77838d6fed436291d9d2877fe1e4b8abdcd`。接收方按锁文件离线安装后，重建的 661 个运行文件与原件逐字节一致。正式归档后再次核对了包内全部 2416 个文件。[固定身份](identity.json) · [独立接收](receiver.json) · [包内复核](sealed-package.json)

| 四种实际会场 | 可观看结果 |
| --- | --- |
| 整层的四席拼桌例会 | [全景](browser/public-meeting-boardroom-floor-perspective.png) · [20.12 秒原速操作](browser/public-meeting-boardroom-floor-normal.webm) |
| 整层的两排入职培训 | [全景](browser/public-meeting-training-floor-perspective.png) · [19.60 秒原速操作](browser/public-meeting-training-floor-normal.webm) |
| 大楼二层的 U 形研讨 | [俯视](browser/public-meeting-u-building-layout.png) · [19.96 秒原速操作](browser/public-meeting-u-building-normal.webm) |
| 大楼二层的白板讨论 | [全景](browser/public-meeting-discussion-building-perspective.png) · [12.76 秒原速操作](browser/public-meeting-discussion-building-normal.webm) |

四房有 10 张桌和 15 把椅子。固定构建从公共入口检查了各席的进出位置，实测了 75 个坐垫接触点。两种既有坐姿的眼位范围共生成 60 个观察位置，各向板面打五束射线，合计 300 束都首先命中图文。关板保存后能恢复关闭状态。翻反板面、挡住讲位视线和用桌子堵门都会被拒绝。[实物测量及失败案例](room-admission.json) · [公共区域与旧房间](public-area.json) · [浏览器报告](browser/report.json)

接收方从四份原配方生成三席入职课，将公告板移到南侧，桌椅旋转 90°，撤去一套桌椅。原四房可逐字节重产，第五房能经普通文件加载，保存、关闭浏览器后恢复。可用固定包的「文件 → 加载」打开下列第五房存档。[三席全景](receiver-browser/perspective.png) · [公告近景](receiver-browser/announcement-on.png) · [接收方配方条目](fifth-input.json) · [可加载存档](fifth-save.json) · [独立浏览器复验](receiver-browser/report.json)

执行批量、换款和包内验证的命令随正式包交付。录像使用 Chromium 软件渲染，真实角色在这些新会议室的坐起、占用及补光效果留待集中联调。[制作与预览说明](../../docs/research/COMPANY-MEETING-ROOM-HANDOFF.md)
