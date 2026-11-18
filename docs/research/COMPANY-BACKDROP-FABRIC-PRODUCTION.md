# 可收卷直播背景幕

此分支供 agent 在直播间内配置一套可移动的落地背景幕。设施实例归属于房间。布面、顶部横轨、伸缩支撑、卷轴和底座组成一套可替换外观。已有独立背景板继续使用自己的静态安装规格。

## 尺寸、状态和摆放

整套预留 2.10 米宽、1.93 米高、0.30 米深，落地原点在底部中央，+Y 向上，+Z 朝布面正面。原分类里的 0.08 米是待核的深度；落地款必须容纳卷轴箱和两只脚。规格选型参考了实物含横轨和支脚的展开尺寸。模型和生产素材的来源单列在家族配方中。[Elgato Green Screen XL 官方尺寸](https://help.elgato.com/hc/en-us/articles/12171382411405-Green-Screen-XL-Product-Specifications)

登记使用 `productionBranch: background-fabric` 和 `mount: floor-surface`。底座、卷轴和伸缩件以同一实例定位。屏幕朝向、房间内的布置和可用通道由实例变换决定。部署比例 `state.deployment` 取 0 到 1，分别对应全收和全展。半展时顶部横轨位于两端高度的中点，可见印花保持原有尺度。条幅上缘连着横轨，布料从底座槽口收放，底座一直占据原地。

民房样例把绿幕放在东侧，布面朝向房内。出租屋使用同尺寸直播间，东侧是通往客厅的门。同一底座搬到那里会挡住出入口，该布局将半展印花幕放在西侧，并把整层转了 90°。两房都复用桌面摄像机。工位随布面调整朝向，使镜头在平面上对准座位，展开的幕布位于座位后方。镜头射线从实际镜头网格取点，用于检查实景布置。

## 复产入口

正式包在根目录用 `node verify.mjs` 校验。在可写副本根目录执行以下命令。预览可用 `node serve.mjs 0` 临时启动，打开打印的地址并使用查询参数 `?delivery=backdrop-home` 或 `?delivery=backdrop-rental`。

```powershell
npm ci --prefix source/prototype
Push-Location source
node scripts/company-platform/build-backdrop-fabric.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-backdrop-roll.mjs
node scripts/company-platform/test-backdrop-rooms.mjs
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/backdrop-rooms.json ../my-backdrop-rooms
Pop-Location
```

制作新款时，在 `source/assets-source/company-backdrop-fabric-v1` 内另存一份配方，指定独立 ID、版本、布料设计和底架造型。在 `source` 目录运行 `node scripts/company-platform/publish-room-appearance.mjs --publish 配方相对路径`，再用 `--check` 复核。重新生成房间前，在布局操作内选定新资源版本。安装规格、行程、开关语义和布局实例身份参与替换检查。浏览器中选中幕布，可用“幕布展开程度”调节收放，选择兼容外观后保存。
