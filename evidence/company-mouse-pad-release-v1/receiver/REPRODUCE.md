# 第五款鼠标与桌垫的接收方复验

机器回执见同目录 `report.json`。最终包位于 `company-workspace/production-trials/mouse-pad-receiver-v1/derived-final`。运行 `node serve.mjs 0` 可在系统分配的本机端口观看。默认房间和 `?delivery=mouse-pad-home` 使用新款，`?delivery=mouse-pad-rental` 保留原轨迹球。

**本次取证范围**

- 首包清单 `2abf675aa08a9242ae162cf3788c12392f9ff454d2ac60d2ec2350af1a6fcfdd` 的 1804 个文件逐一通过。独立副本初始无 node_modules，从本机 npm 缓存执行锁文件安装，实际安装 35 个包。原版重建 527 个查看器文件及双房 8 个批次文件，逐字节一致。
- 修订包清单 `d7e1fde3bf8c642ffc5bb09512858ab248ff51515fcff5f73adc1ce5dc208d00` 的 1805 个文件逐一通过。同一工作副本归档了首版第五款，刷新 14 个路径后复核全部 1805 个声明文件，保留首次安装的依赖。修订版再次重建，查看器 527 文件、双房批次各 4 文件均与修订包逐字节一致。
- 独立运行修后 `edit.mjs` 共 9 次。合法输入可验证、可编辑。键盘压垫在 validate 和 apply 均返回 `desktop-area-occupied`。楼层转 90°、桌垫再局部转 90° 的合法布局通过，将边缘移动至桌外后两入口均返回 `invalid-desktop-envelope`。失败未创建结果文件，两份原存档和旋转后的合法输入保持原字节。首次负例草案单独旋转了办公桌且未带动邻座，提前触发了原有的 `blocked-use-space`。有效旋转用例保留桌椅相对位置。
- 新款只改 home 鼠标的资源 ID 和版本。租房两份布局/存档、座面检查和批次输入等六文件保持原字节。租房批次报告仅更新制作所用的整库哈希。两份命名房间均含完整 batch-result。默认入口输入是同一份 home 存档。
- 正式派生包清单 `ddf1ac8998f0b3a9484e54055770de72a3c8c48a87308473f22ff2df2f1f086c` 的 1807 个文件均已复核。软件 Chromium 实际载入第五款 GLB；同一外观菜单可从旧办公款切回第五款。线缆连接长度 249 mm，断开后 224 mm。保存、关闭 Chromium 后，从相同浏览器资料的无交付查询页重开，存档匹配，连线状态和几何端口保持。

**从修订净包独立重做**

在修订包的全新可写副本根目录运行。命令会生成新目录。下列 `COMPARE` 指本回执目录的 `compare-trees.mjs` 绝对路径。

```powershell
node verify.mjs . d7e1fde3bf8c642ffc5bb09512858ab248ff51515fcff5f73adc1ce5dc208d00
npm ci --prefix source/prototype --offline --no-audit --no-fund
Push-Location source/prototype
node scripts/build-company-id.mjs
node node_modules/vite/bin/vite.js build --config vite.company.config.js
Pop-Location
node COMPARE viewer source/prototype/dist-company viewer-comparison.json
Push-Location source
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/mouse-pad-rooms.json ../original-rooms
Pop-Location
node COMPARE data/rooms/mouse-pad-home/batch-result original-rooms/mouse-pad-home home-comparison.json
node COMPARE data/rooms/mouse-pad-rental/batch-result original-rooms/mouse-pad-rental rental-comparison.json
Push-Location source
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-mouse-pad-v1/examples/compact-mat-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-mouse-pad-v1/examples/compact-mat-v2.json
Pop-Location
```

将包内的 `source/scripts/company-platform/batch-inputs/mouse-pad-rooms.json` 复制为副本根目录的 `receiver-batch.json`，在 home 项的 `operations` 末尾追加以下单个操作。试制目录里已有本次确切的 `receiver-batch.json`。

```json
{"type":"replace-resource","id":"mouse-pad-home/ground/live/station-1/mouse","resource":{"id":"mouse-pad-compact-mat","version":2}}
```

```powershell
Push-Location source
node scripts/company-platform/batch.mjs ../receiver-batch.json ../receiver-rooms-final
Pop-Location
Push-Location source/prototype
node scripts/build-company-id.mjs
node node_modules/vite/bin/vite.js build --config vite.company.config.js
Pop-Location
node source/scripts/company-platform/package-company.mjs source/prototype/dist-company 5b226c1b5a72 receiver-rooms-final/mouse-pad-home/save.json derived-final --source source --seat-contacts --room mouse-pad-home receiver-rooms-final/mouse-pad-home --room mouse-pad-rental receiver-rooms-final/mouse-pad-rental
node derived-final/verify.mjs derived-final ddf1ac8998f0b3a9484e54055770de72a3c8c48a87308473f22ff2df2f1f086c
```

在公司树根目录，可用 `node evidence/company-mouse-pad-release-v1/receiver/check-edit.mjs TRIAL NEW_RESULT` 重跑编辑正反例，用 `node evidence/company-mouse-pad-release-v1/receiver/fifth-browser.mjs TRIAL DERIVED_PACKAGE NEW_RESULT` 重跑浏览器验证。批次和含错误命名房间的打包拒绝由副本内 `source/scripts/company-platform/test-mouse-pad-offline.mjs` 实测，详见试制目录的 `offline-final-cases/report.json`。
