# 沙发软装与宽扶手安装

公开制作源码为 `b9cf6eb038e017d32352a63b16fe5ba2e2909dec`，固定运行构建为 `b3b863a7e88c`。本机独立交付位于 `company-workspace/deliveries/static-textiles-v1`，固定源码位于 `company-workspace/worktrees/static-textiles-v1`。两间样板使用同一套配方入口和兼容软装，分别布置在单间会客区和出租屋休息间。

## 接收与复产

1. 在正式包根目录执行以下核对命令。仅观看时执行 `node serve.mjs` 即可。默认打开单间，出租屋用 `/company.html?delivery=textile-rental`。
2. 复制正式包到自己的工作目录，在工作副本根目录执行 `npm ci --prefix source/prototype`。进入 `source` 目录后运行下面的制作命令。Windows 下也可使用正斜杠。

```text
node verify.mjs . 3a9c80d938fa1108fa7731fb1201fae64953be04be3a732935e05124001479da
```

```text
node scripts/company-platform/build-sofa-textile-hosts.mjs --check
node scripts/company-platform/build-static-textile-collection.mjs --check
node scripts/company-platform/test-static-textile-rooms.mjs
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/static-textile-rooms.json output/static-textile-rooms
node prototype/scripts/build-company-id.mjs
```

从 `source/prototype` 执行 `node node_modules/vite/bin/vite.js build --config vite.company.config.js`。回到 `source` 运行浏览器验收命令。开发机已安装 Playwright 对应的 Chromium。输出目录放在工作副本里。

```text
node scripts/company-platform/qa-static-textiles.cjs prototype/dist-company b3b863a7e88c scripts/company-platform/fixtures/static-textiles.json output/textile-qa --record
```

### 独立制作第五款

在工作副本的 `source` 内执行。可编辑配方把毯宽改为 0.309 米，配上十二组流苏和三道条纹。`travel-room.json` 用实例 ID 和扶手面名表达安装关系。

```text
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-static-textile-v1/examples/travel-throw-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-static-textile-v1/examples/travel-throw-v2.json
node scripts/company-platform/batch.mjs assets-source/company-static-textile-v1/examples/travel-room.json ../my-textile-studio
```

重复上述构建身份和 Vite 命令即可得到包含旅行搭毯的运行版本。此输入得出 `c98c951b3c99`。从 `source` 重新打包并核对。

```text
node scripts/company-platform/package-company.mjs prototype/dist-company c98c951b3c99 ../my-textile-studio/travel-studio ../travel-delivery --source .
node ../travel-delivery/verify.mjs ../travel-delivery ad88bdbe12962195a1b0d2d33f5f1e98ef7958e38e272a1ed77af238812c327c
```

随回执附有 `receiver/qa-travel-throw.cjs`。可把它复制到工作副本的 `source/prototype/output/`，在 `source/prototype` 执行 `node output/qa-travel-throw.cjs ../../travel-delivery c98c951b3c99`。脚本从新包自带的服务取存档，启动、保存并重新打开 Chromium。[独立房间实测](receiver/report.json) · [恢复后的旅行搭毯](receiver/02-browser-restored.png)

## 验收结果与适用范围

- 抱枕、流苏搭毯、褶边沙发罩和半卷桌垫各自有实际几何。这里展示收放在扶手上的固定造型。两款沙发保留各自原型的座面、靠背和左右进出点，并增加实测尺寸的扶手和相应的落地阻挡。款式换装、父子移动及转向、复制、错误支承拒绝、保存与关闭恢复均有覆盖。[模型几何](cpu/textile-geometry.json) · [沙发实测](cpu/hosts.json) · [两布局与拒绝用例](rooms.json)
- 固定浏览器 13 项通过（含录像），接收方浏览器 12 项通过。全新安装锁定依赖后，507 个运行文件、两份批次共 8 个输出文件与固定版本逐字节相同。交付清单覆盖 1,728 个文件，在独立试制后再次核对，无额外、缺失或变更文件。[固定录像，12.40 秒原速](fixed/video/static-textiles-normal.webm) · [独立报告](independent/report.json) · [重建对照](rebuild.json) · [净包复核](clean-after.json)
- 实测初次固定检出的参数末尾换行与来源摘要不同，重存原始字节后从新提交核对并构建。另有一项复制负例会挡住原沙发左座的离开位置，检查返回具体的座位与阻挡物。[源码字节修正](source-pin-correction.json) · [放置证据](rooms.json)
- 模块款右扶手与底座正面有一小段共面接缝，局部可见细杂线。拱架款的扶手没有这段接缝。此包验证固定软装造型和设施数据；真实角色坐起、布料动态和普通电脑性能另计。[接缝所在画面](fixed/textile-studio-static-textile-throw-v1.png) · [全部版本](identity.json)
