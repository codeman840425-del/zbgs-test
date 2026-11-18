# 可收卷直播背景幕

固定源码为 `3633de680712a9b0f45628316c4efa86154ce628`，构建为 `2070c652571c`。可交给其他 agent 的原包位于 `company-workspace/deliveries/backdrop-fabric-v1`。两间房都配有直播桌、座椅和桌面摄像机。[原速录像，13 秒](browser/video/backdrop-rooms-normal.webm) · [民房印花幕](browser/backdrop-home-backdrop-fabric-print-full.png) · [出租屋透纱幕](browser/backdrop-rental-sheer-as-built.png)

绿色幕、蓝色幕、印花幕、透纱幕共用一种落地规格。民房把底座放在东侧，出租屋的东侧开门，所以底座放在西侧。固定浏览器在两份布局中分别完成四款外观的收起、半展、全展和关闭重开。半展保留印花比例，收起后底座仍占地。门口或座椅接近点受阻时会返回具体原因。[房间检测](production/rooms.json) · [浏览器实测](browser/report.json) · [录像核对](browser/video-review.json)

## 独立复产

接收方在试制区从原包安装锁定依赖并重建。543 个查看器文件与两间房的 8 个批次文件逐字节一致。随后，接收方按随包配方发布第五款河岸印花，将它装入民房，保存半展状态并关闭浏览器。重新启动后仍是同一款幕布，可见布高 0.89 米。出租屋的输入、布局与存档保留原字节，生产报告更新了素材目录的哈希。无效展开值 1.2 被拒绝，之前的 8 个输出均保留。接收方在候选归档前完成原包校验，报告保留当时的临时路径。归档后的清单与原文件哈希相同。[机器回执](receiver/RECEIVER.json) · [第五款冷启动画面](receiver/browser-final/03-cold-half.png) · [两个构建与清单身份](identity.json)

## 重跑

在原包根目录核对身份并打开预览。使用输出地址，加上 `?delivery=backdrop-home` 或 `?delivery=backdrop-rental`。

```powershell
node verify.mjs . 81f3f0c8d875e3bcbed3f15a455db6b8b8ff97db9fb7e6246dc501fec32f02ef
node serve.mjs 0
```

在可写副本根目录运行下列命令。浏览器回归使用 Playwright 的 Chromium，包含 1 倍速录像。

```powershell
npm ci --prefix source/prototype
node source/scripts/company-platform/test-backdrop-roll.mjs
node source/scripts/company-platform/test-backdrop-rooms.mjs
node source/scripts/company-platform/qa-backdrop-rooms.cjs . 2070c652571c ./my-browser-check --record
Push-Location source
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-backdrop-fabric-v1/examples/river-print-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-backdrop-fabric-v1/examples/river-print-v2.json
Pop-Location
```

独立接收过程使用已有 npm 缓存完成离线安装。现场图像来自 Chromium 软件渲染，镜头与座椅、幕布的对齐验证使用实际设备网格和空座位置。真实角色、推流和普通电脑帧率另行验证。[生产规格与双房配方](../../docs/research/COMPANY-BACKDROP-FABRIC-PRODUCTION.md)
