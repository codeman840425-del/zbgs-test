# 落地屏风与自定义外观交付

固定制作源码为 `6b2afe8b7203b1ea3b0a2b752ae14249fa315b2c`，正式包构建为 `672695e1c4bd`。干净交付目录在 `company-workspace/deliveries/screen-partitions-v1`，固定源码在 `company-workspace/worktrees/screen-partitions-v1`。交付目录由 `transfer-manifest.json` 及其中列出的 1,686 个文件组成。清单 SHA-256 为 `e38828a6bf6ea687dff5e437744e7b778dbe44a35ba68451a05cf54c2e5187ee`。

## 在自己的目录接手

先在正式包根目录运行以下命令核对文件。观看原包用 `node serve.mjs`。制作时将整个干净包复制到一个新的工作目录，在工作副本的根目录执行后续步骤。

```text
node verify.mjs . e38828a6bf6ea687dff5e437744e7b778dbe44a35ba68451a05cf54c2e5187ee
```

1. 在工作副本根目录运行 `npm ci --prefix source/prototype` 安装锁定依赖，随后执行 `node edit.mjs validate data/save.json`。
2. 在 `source` 目录运行下面的命令。两个示例在统一功能规格内改变了几何结构。台灯把原单支杆改为叉架，毡面屏风从十二块增加到十五块。需要自己的外观时，把示例配方复制到自己的 `assets-source/company-名称/` 下，留下要生产的设计，修改资源 ID 或版本与构造参数。
3. 在 `source/prototype` 执行 `node scripts/build-company-id.mjs` 和 `node node_modules/vite/bin/vite.js build --config vite.company.config.js`。再从 `source` 以新构建和该房间制作新包。

```text
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-desk-lamp-v1/examples/a-frame-reading-v1.json
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-screen-partition-v1/examples/acoustic-narrow-tiles-v2.json
node scripts/company-platform/batch.mjs assets-source/company-screen-partition-v1/examples/published-room.json ../my-reading-studio
node scripts/company-platform/build-library.mjs --check
```

此次输入在干净副本得出的派生构建为 `bc34fe79e2b2`。对应打包和验收命令从工作副本的 `source` 执行，报告目录选用尚未使用的目录。

```text
node scripts/company-platform/package-company.mjs prototype/dist-company bc34fe79e2b2 ../my-reading-studio/reader-studio ../published-studio --source . --room reader-studio ../my-reading-studio/reader-studio
node ../published-studio/verify.mjs ../published-studio
node scripts/company-platform/qa-published-room-looks.cjs ../published-studio bc34fe79e2b2 ../browser-receipt --record
```

## 实际验收

- 四款固定展开的屏风共用 1.80 × 2.00 × 0.08 米规格。木屏保留 Kenney 已获许可的立体嵌板，布屏、毡屏和玻璃屏使用各自的几何结构。玻璃两面可见身后的实物，框架与底轨投影，玻璃保留通行阻挡。来源与生产几何记录在 [来源比较](cpu/source-comparison.json) 和 [几何报告](cpu/geometry.json)。
- 单间的屏风分开直播桌和会客沙发，出租屋的屏风安放在工作间。逐件换款、移位、转向、堵门拒绝、进程重启和原存档恢复均经验证。两张屏风封住座位唯一路径时，静态准入返回 `disconnected-use-space`。固定与独立浏览器分别通过十项（含录像）和九项。[放置及九个拒绝用例](cpu/placement.json) · [固定浏览器](fixed/report.json) · [独立浏览器](independent/report.json) · [12.72 秒原速录像](fixed/video/screen-partitions-normal.webm)
- 接收工作副本从空 npm 缓存联网安装，495 个重建运行文件逐字节匹配。首次接收和独立试制结束后，正式目录均无额外、缺失或变更文件。[重建记录](independent-rebuild.json) · [原件最终复核](clean-after.json)
- 公开工作副本用同一发布命令把 236 项扩为 238 项。两件新款进入同一个实际浏览器房间，灯的开关、强度和俯仰在关闭 Chromium 后恢复，屏风继续挡路。派生包的 1,690 项文件均通过核验。[新增台灯](receiver-lamp.json) · [新增屏风](receiver-screen.json) · [派生浏览器回执](published-browser/report.json) · [开灯画面](published-browser/01-delivered-room.png) · [重开后的关灯画面](published-browser/02-restored-room.png)
- 原版台灯 `5bfe97a233ec` 的自定义生成命令只提供试样。上述正式发布和文件集合校验入口随 `672695e1c4bd` 交付。历史台灯净包及原清单的复核记录见[接收说明](../company-clean-transfer-receipt-v1/README.md)。

独立工作副本位于 `company-workspace/production-trials/screen-partitions-receiver-v1`，里面的 `published-studio` 是可再移交的干净派生包。在本机预览 `62080` 可查看两个屏风房间及接收方样板，保留 11 个既有场景。人类预览另含原有私有美术，构建为 `147784f13772`。固定录像使用桌面 Chromium 软件渲染，真实人物通行和受光、普通电脑性能、实际声学及结构强度均另行验证。[版本、录像和清单](identity.json)
