# 两个直播间的桌面盆栽

民房和整套出租屋各支持盆景、双臂仙人掌、扇展阔叶和莲座多肉。两份房间批次沿用工位上的桌、椅、屏幕、键盘、手机和麦克风。打开[14.84 秒原速录像](browser/desktop-plants-normal.webm)可观看四款依次替换、保存、关闭浏览器和重开，以及第二张桌上的阔叶。固定源码为 `5f4cdfe34462f8841858511fa8f45ccaf50958d7`，构建为 `d57333ea66d2`。[民房画面](browser/home.png) · [出租屋画面](browser/rental.png) · [固定身份](identity.json)

[正式包](../../company-workspace/deliveries/desktop-plants-v1/README.md)包含两间房的输入和存档、可修改的配置、四款素材源及制作工具。正式目录封存后复核了 1,935 个文件。接收方在独立目录离线装入锁定依赖，查看器的 559 个文件和两份批次的 8 个文件与原版逐字节相同。[素材与安装规则](../../docs/research/COMPANY-DESKTOP-PLANTS-PRODUCTION.md) · [几何实测](production/geometry.json) · [独立复产回执](receiver/production.json)

两房各通过四款实际模型的替换、盆底接触和保存恢复。测试在出租屋将盆栽移到手机上，系统拒绝覆盖原摆放和存档。在同一房间移到空位、再旋转工位后，盆栽随桌转向。通过普通添加菜单还可以给另一房间的桌子新增盆栽及移除。[房间检查](production/rooms.json) · [固定浏览器](browser/fixed.json) · [交付包浏览器](browser/package.json) · [录像逐帧核对](browser/video-review.json)

发现并修复了一处共用摆放错误。转向台灯靠近装饰物时，隐藏楼层的预检曾用默认灯头角度计算间距。修后按保存的实际角度校验，可见场景、当前楼层编辑、整楼编辑和离线批次对三种临界摆放的结果一致。9 个原有合法输入、布局和存档逐字节保留。[修前](production/before-fix.json) · [修后](production/after-fix.json) · [四个入口对比](production/lamp-clearance.json)

## 在接收端添一款新素材

独立接收方从源代码生成了双丛香草槽盆和 64 × 64 叶脉纹理，经过正式发布入口替换民房里的盆栽。出租屋的输入、布局和存档保持原字节。新纹理从源 GLB 到游戏 GLB 保留原始 PNG。关闭浏览器再开后，叶面恢复同一纹样。派生包构建为 `60ddf2568902`，完整校验通过 1,944 个文件。[独立派生包](../../company-workspace/production-trials/desktop-plants-receiver-v1/published-planter/README.md) · [民房全景](receiver/room.png) · [纹理实景](receiver/reopened.png) · [浏览器回执](receiver/browser.json) · [独立接收汇总](receiver/acceptance.json) · [可编辑原稿](receiver/source/author-planter.mjs)

## 复核命令

在正式包根目录执行以下命令。打开程序给出的临时地址，查询参数分别使用 `?delivery=plant-home` 或 `?delivery=plant-rental`。

```powershell
node verify.mjs . c088eecb20d9ba8e93a83f18c21c33c1dc7dacd4b1c6ee8000fae228256b8d53
node serve.mjs 0
```

在接收方可写副本的根目录执行。安装检查、房间碰撞和浏览器回读使用包内同一份代码和素材。

```powershell
npm ci --prefix source/prototype
node source/scripts/company-platform/build-desktop-plants.mjs --check
node source/scripts/company-platform/test-desktop-plant-assets.mjs ./qa/geometry
node source/scripts/company-platform/test-desktop-plant-rooms.mjs
```

若已安装与依赖锁匹配的 Playwright Chromium，可从该副本的 `source` 目录运行下列命令，首个参数指向已封存的正式包，最后一个目录须尚未存在。

```powershell
$package = 'F:/gamemake-company-platform-c1/company-workspace/deliveries/desktop-plants-v1'
node scripts/company-platform/qa-desktop-plant-rooms.cjs $package d57333ea66d2 ../qa/browser --record
```

本次浏览器渲染环境为 Chromium SwiftShader。普通电脑的硬件帧率及角色 C3 由对应阶段另验。
