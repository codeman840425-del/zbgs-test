# ENV-010 · 自制桌面盆栽原稿交付

同一份制作者原稿现已通过直接试导、正式发布、冷重建和浏览器保存重开。原故障出现在正式发布阶段：有有效 `author.py` 的盆栽被要求提供墙灯的 `editableContour`。修复后的盆栽使用 `provenance.dependencies.editableSource` 固定原稿路径和 SHA-256。本机内部验收通过。外部融合组的独立复验仍待回执。

| 固定身份 | 源码或构建 | 清单 SHA-256 | 已核文件 |
| --- | --- | --- | --- |
| 修复提交 | `58c0cd4c01f34a3923b4b6b80812ac2a2f4b03d4` | 父提交 `5f4cdfe34462f8841858511fa8f45ccaf50958d7` | 六个生产与交付文件与提交逐字节相同 |
| 母包 `company-workspace/deliveries/desktop-plants-v1.1` | `d57333ea66d2` | `6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2` | 1939/1939 |
| 派生包 `company-workspace/production-trials/plant-editable-receiver-v1/herringbone` | `1d2def2293aa` | `bcabbed59e0db7f4f26c6e0f31d3137c6a2cca0ff99b50fbb27ceacb628e3ae5` | 1950/1950 |

母包在独立副本按锁安装后重建了 559 个查看器文件，全部与 v1 字节相同。原四款 GLB、四份侧车和集合也逐一相同。接收者重新运行原稿，六份输出或输入与融合验收提供的内容逐字节吻合。派生净包在另一份新安装中重建了 561 个查看器文件，全部与派生查看器匹配。[母包回执](reports/pristine.json) · [接收回执](reports/receiver.json) · [净包复核](reports/verified-after-rebuild.txt)

新款 `desktop-plant-herringbone-ceramic@1` 有 158 个三角面，交付 GLB 为 30,636 字节，SHA-256 为 `9141412dd95b66b4efeb3ad550d47b395b7e6b1172c38eac35f9f0775a6d0ff7`。原稿和许可证同随派生包交付。Kenney 的原始几何为 CC0；制作者的 PNG 图案及 UV 改作获准在本项目包中收录与复现。[原稿与许可](creator-source/LICENSE.txt) · [直接试导](reports/original-direct.txt)

民房 `plant-home` 换用青陶盆栽。桌面局部位置从 `[-0.70, 0.84, -0.25]` 移至 `[0.70, 0.84, -0.26]`；保存后关闭 Chromium，重新启动仍显示相同盆栽和新位置。出租屋 `plant-rental` 保留 `desktop-plant-broadleaf@1`，输入、布局、存档三个文件逐字节相同。[交付画面](browser/01-herringbone-as-delivered.png) · [冷开画面](browser/03-herringbone-restored.png) · [浏览器回执](browser/report.json)

[原速录像，13.12 秒](browser/video/herringbone-ceramic-normal.webm) 共 328 帧，1500 × 950、25 fps。第 6.20 秒是浏览器进程重启的分界。合并后逐帧与两段原始录像相同，录像 SHA-256 为 `18fd8f81480a33f0b25b87299fef0e4e5173898763582cd0d15d0f92108cb55e`。浏览器报告保留了全场截图和两段素材的原始文件名，本目录精选其中两张图及完整合并录像。[录像核验](browser/video-review.json)

原稿哈希错误、缺少哈希、文件缺失和路径越界均被直接试导及正式发布拒绝。已发布后，修改原稿使建库检查返回 `appearance-source-pin-mismatch`，移除原稿返回 `appearance-source-missing`，原文件按 SHA 恢复后检查通过。[改动原稿](reports/changed-author.txt) · [移除原稿](reports/absent-author.txt) · [文件身份清单](identity.json)

## 在母包副本重现

在项目根目录的 PowerShell 中保存证据目录位置，再进入已复制的母包的 `source` 目录。使用装有 Pillow 的 Python、Node.js 与包内锁定依赖。作者脚本会新建其原稿目录，初次运行采用干净副本；输出目录名也需尚未使用。

```powershell
$evidence = (Resolve-Path evidence/company-editable-plant-release-v1).Path
# 接下来在母包可写副本的 source 目录运行
npm ci --prefix prototype --no-audit --no-fund
python "$evidence/creator-source/author.py" .
$recipe = 'assets-source/company-desktop-plants-v1/receiver-herringbone-v1/recipe.json'
node scripts/company-platform/build-desktop-plants-v2.mjs --parameters $recipe --output ../direct-herringbone
node scripts/company-platform/publish-room-appearance.mjs --publish $recipe
node scripts/company-platform/publish-room-appearance.mjs --check $recipe
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs "$evidence/reproduction/rooms.json" ../art-rooms
Push-Location prototype
$build = node scripts/build-company-id.mjs
node node_modules/vite/bin/vite.js build --config vite.company.config.js
Pop-Location
node scripts/company-platform/package-company.mjs prototype/dist-company $build ../art-rooms/plant-home ../herringbone --room plant-home ../art-rooms/plant-home --room plant-rental ../art-rooms/plant-rental
node ../herringbone/verify.mjs ../herringbone bcabbed59e0db7f4f26c6e0f31d3137c6a2cca0ff99b50fbb27ceacb628e3ae5
```
