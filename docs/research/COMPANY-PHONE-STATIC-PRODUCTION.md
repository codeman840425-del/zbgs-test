# 桌面直播手机

在直播桌旁摆放一部可转向、可换外观、可开关屏幕的手机。民房样例把亮屏手机放在键盘右侧，出租屋在转向 90° 的楼层里把横屏手机放在键盘左侧，初始关屏。两间房均由同一批次文件生成。

## 制作输入

四款固定外观共用 `phone-static` 安装规格。手机连同自己的底座或夹具放在桌面上，父物为 `desk.desktop`。安装原点在桌面，单位为米，向上为 +Y，屏幕朝 +Z。整个桌面预留区域为 180 × 110 mm，成品最高 190 mm。早期暂定宽度 90 mm 只容得下竖放的机身；横放同样大小的手机及支座也需要容纳在同一个换款区域内。

竖屏款使用 Grab3D 的真实手机机壳与显示玻璃。原始 GLB、制作清单、许可与摘要随生产源移交。公共屏幕节点 `phone-screen` 由实例自己的布尔字段 `state.on` 驱动。其他造型可用可编辑配方定义机身、镜头与支撑件。画面是游戏里的静态道具显示。[上游素材与许可](https://grab3d.com/models/electronics/smartphone/)

## 生成两间房

先在交付包根目录运行 `node verify.mjs`。在包的可写副本根目录运行以下命令。浏览器验证使用 Playwright 对应的 Chromium，最后一条的 BUILD_ID 取自 `viewer/company-build-info.json` 的 `shortId`。

```powershell
npm ci --prefix source/prototype
Push-Location source
node scripts/company-platform/build-phone-static.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-phone-rooms.mjs
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/phone-rooms.json ../my-phone-rooms
Pop-Location
node source/scripts/company-platform/qa-phone-rooms.cjs . BUILD_ID phone-browser-check --record
```

## 接入另一个外观

在 `source/assets-source/company-phone-static-v1` 内另存配方，保留固定安装与屏幕规格，为新造型填写独立的资源 ID、版本、来源及制作参数。在 `source` 下执行 `node scripts/company-platform/publish-room-appearance.mjs --publish 配方相对路径`，用同一路径执行 `--check` 可复核已登记内容。在房间配方中替换对应实例的资源引用，再批量生成、重建预览并打包。

房间编辑使用普通桌面设施的移动、转向与电源开关。机身越出桌沿、预留区域与其他设备重叠、屏幕状态类型错误时，命令会指出相关设施。单台手机的关屏状态与另一台独立保存。独立可挂接的手机支架另有安装规格；本组展示随手机外观一同更换的支撑件。
