# 工作室和出租屋的低位唱麦

固定源码提交 `ca1b3349a8e534f03522ad058223ab0b2031f9d8`，查看器 `156ab204dddf`。正式包位于 [company-workspace/deliveries/vocal-fit-v1](../../company-workspace/deliveries/vocal-fit-v1/README.md)，清单 SHA-256 为 `64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc`，移至正式位置后核验 2,267 项。接收方从空依赖缓存安装并重建全部 631 个查看器文件，结果逐字节一致。[双房移交回执](handoff.json) · [接收方复产](receiver/checks.json)

原角色版本 `ddcf40a56d0e` 在两房实际到位时，女角色嘴部距离超过 26 cm。新设施 `floor-vocal-mic-disc-fit-lower@1` 使用已有 CC0 话筒模型，保持三脚垫和圆盘底座接地，把机头俯仰从 −8° 调至 −4°，并将机头前移 44 mm。伸缩立柱和悬臂通过实体套合支撑机头。与原模型相比，网头中心实际降低约 40 mm、向歌手伸出约 61 mm。使用点、设施实例、朝向及接近退出点沿用原房间；原已发房间仍可按各自版本打开。[可编辑配方与尺寸](../../assets-source/company-vocal-fit-v1/README.md) · [源模型复产与负例](production.json)

| 核验内容 | 结果 |
| --- | --- |
| 历史角色姿势和真实模型 | 原设备复现女 0/7、男 50/50。新设备女 7/7、男 50/50 均先命中真实网头。女体距网面 24.61–25.38 cm，男体 16.14–17.76 cm。最紧女体上界余量 6.24 mm。两房固定制作参考口位距网面均为 6.56 cm。[带源数据的复算](contact-replay.json) |
| 拍摄与读谱 | 工作室原相机拍摄制作参考嘴位时被新网头挡住。依据真实网面投影把相机在原桌面向左移 16 cm；出租屋沿用原机位。两房实际镜头至历史角色嘴、眼的 114 条视线均畅通，每页 260 个谱面样点通过，入口与进退通路检查通过。[原镜头的拒绝](camera/original-camera-failure.json) · [调整位置的依据](camera/camera-projection.json) |
| 房间开启、操作与恢复 | 两个独立浏览器进程按正式保存重开，记录同一 GLB、使用点及拾音规格。原圆盘房的普通换款菜单保留原四款，以换皮方式改变拾音规格会被拒绝。[房间与近景对照](browser/two-rooms.png) · [固定查看器](browser/fixed.json) · [交付包浏览器](browser/independent.json) |
| 接收方改规格 | 包内第二份配方将前移量改为 43 mm。普通外观发布被拒，显式发布生成另一个 ID。两间派生房间的存档回读正常，历史 57 个姿势复算全部通过，原包再验仍为 2,267 项。[接收操作与命令](receiver/checks.json) · [派生设备的逐点实测](receiver/shorter-contacts.json) |

房间演示使用软件渲染，录像为 1×、16.88 秒、25 fps；切镜时有短暂空画面，出租屋机位下缘可见桌面。角色接触数据取自既有游戏帧，女角色持续演唱、取消释放和冷开仍需总工在新配对中实际运行。[正常速度录像](browser/video/vocal-fit-rooms-normal.webm) · [解码及画面核对](browser/decoded-video.json)

融合组补交了同一原签名配对的八个判定帧。逐帧核对嘴、眼和朝向后，工作室女角第 542 帧与原 57 个观察重合，其余七帧是新输入。旧判定八次均复现；正式新网头八次均通过，16 条拍摄嘴、眼的视线均畅通。两批数据合计 64 个不同姿势，最紧的是出租屋女角第 609 帧，距网面 25.411 cm，距 26 cm 上限剩 5.893 mm。这个余量需要在新游戏运行中实测。原相机、谱架、接近和离开的验收条件均沿用。该组另测了旧网头整体下移 16 cm 的数值对照，仍缺实际支撑和整房测量。[八帧逐点记录](fusion/report.json) · [独立复算入口](fusion/replay.mjs) · [融合组原始资料](F:/gamemake-test/native-studio-round/independent/performer-anchor-ddcf/mic-axes/REPORT.md)

## 接收和复跑

在交付包根目录运行头两条命令，查看器启动后可分别访问 `?delivery=singing-studio` 和 `?delivery=singing-rental`。后续生产和检查命令在可编辑的 `source` 副本中运行。将参数 `CANDIDATE` 和 `BASELINE` 换为新包和已签名的 `vocal-use-v1.1` 目录，`NEW_OUTPUT` 换为独立结果目录。原包清单 SHA-256 为 `5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012`。

```text
node verify.mjs . 64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc
node serve.mjs
node scripts/company-platform/build-vocal-fit.mjs --check
node scripts/company-platform/publish-room-appearance.mjs --publish-fit assets-source/company-vocal-fit-v1/examples/shorter.json
node scripts/company-platform/check-vocal-fit-contacts.mjs CANDIDATE BASELINE NEW_OUTPUT
node scripts/company-platform/qa-vocal-slot.cjs CANDIDATE 156ab204dddf NEW_BROWSER_OUTPUT --fit --record
```
