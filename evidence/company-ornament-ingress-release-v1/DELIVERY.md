# 休息室三款桌面摆件交付

当前交付 **v2，构建 83d6a963ffa3**。同一间休息室提供书组、小盆栽和收音机三种布置。第三款摆件选用 Kenney Furniture Kit 2.0 的独立模型，由接收交付包的制作者沿原有配方和发布命令制成。项目生产代码无需改动。浏览器首开和保存后重开均显示收音机，实例仍挂在同一张木圆几的 top 面。[恢复后截图](v2/radio-restored.png) · [浏览器实测](v2/radio-browser.json)

## 打开三种布置

从项目根目录进入 `company-workspace/deliveries/gamemake-company-ornaments-delivery-v2`，执行 `node serve.mjs`。保留控制台打印的主机和临时端口，使用下列路径。三份布局都使用公司身份 `concept-lounge-rental` 和摆件实例 `concept-lounge-rental/ground/lounge/sourced-ornament`。

| 布置 | 预览路径 | 存档修订 | CC0 原包模型 | 游戏资源 |
|---|---|---:|---|---|
| 书组 | `/company.html?delivery=1` | 3 | `books.glb` | `tabletop-books-kenney@1` |
| 小盆栽 | `/company.html?delivery=potted-plant` | 4 | `plantSmall3.glb` | `tabletop-plant-kenney@1` |
| 收音机 | `/company.html?delivery=radio` | 4 | `radio.glb` | `tabletop-radio-kenney@1` |

在查看器中保存后，关闭浏览器并用相同用户配置打开同一端口的 `/company.html`，可恢复主动保存的布置。模型作者均为 Kenney，三个原 GLB 位于随包 ZIP 的 `Models/GLTF format/`，许可证在 ZIP 的 `License.txt`。本次实测覆盖静态摆件陈列、替换、承载和存档恢复。[来源与每款模型摘要](v2/verification-after-relocation.json)

## 两版证据

| 交付版本 | 固定源码提交 | 查看器构建 | 交付文件 | 查看器文件 |
|---|---|---|---:|---:|
| v1 书组及盆栽 | `3ed223e135a121fd4b21c801507c16b10660f786` | `24435a4e1c9f` | 1,601 | 475 |
| v2 增加收音机 | `6c47574c4e188120bc413d032e8f292d1a67d244` | `83d6a963ffa3` | 1,609 | 477 |

**v1 浏览器实测。** 从原休息室导入书组，保存并关闭重开，原位换为盆栽。尝试移出承载面时，查看器拒绝操作并保留场景和已有存档。再次重开后恢复了盆栽。固定查看器和独立交付查看器均完成这条路径。[固定构建报告](fixed/report.json) · [独立交付报告](independent/report.json) · [书组截图](fixed/01-books.png) · [盆栽恢复截图](fixed/03-plant-restored.png)

**录像实际对应 v1。** 既有录像展示休息室、书组和换款后的盆栽，构建为 `24435a4e1c9f`，1 倍速，6.36 秒，1600 × 1000，25 帧/秒。v2 收音机的观看证据是独立制作者的重开截图和实际浏览器报告。[原速录像](fixed/video/sourced-ornaments-normal.webm) · [收音机恢复截图](v2/radio-restored.png)

**v2 盲交付。** 制作者仅使用旧交付包和其 CC0 原 ZIP，自选收音机，用同一个 publish 入口登记新资源，再用 check 从原 ZIP 重做，得到相同 GLB。实际下载的 GLB 为 25,168 字节、432 个三角形、三个网格。首次载入和重开时实测物底、桌面世界高度均为 0.500 米，局部位置为 [0.035, 0.5, −0.012]，绕 Y 轴 90°。原制作包浏览器检查的查看器与最终三款交付中的 477 个查看器文件逐字节相同。[发布与重复导出](v2/radio-publication.json) · [收音机实测](v2/radio-browser.json)

**迁移复核。** 两份交付清单的每个文件大小和 SHA-256 均在现址重验通过。v1 查看器与其固定树逐字节相同。v2 的三份房间文档逐一等于指定输入，查看器与固定树及独立制作者交付逐字节相同。交付时从随包源码另行离线重建也得到相同的 477 个运行文件。原始回执保留执行当时的绝对路径，迁移后回执使用相对本项目根的现址。[交付时回执](v2/verification-at-release.json) · [迁移后回执](v2/verification-after-relocation.json)

## 建议暂存的公开证据

以下命令从项目根目录执行。清单逐个指定书组、盆栽、收音机的验收记录和已查看的媒体。

```powershell
git add -- evidence/company-ornament-ingress-release-v1/DELIVERY.md
git add -- evidence/company-ornament-ingress-release-v1/publication.json
git add -- evidence/company-ornament-ingress-release-v1/change-to-plant.json
git add -- evidence/company-ornament-ingress-release-v1/embedded-images.txt
git add -- evidence/company-ornament-ingress-release-v1/fixed/report.json
git add -- evidence/company-ornament-ingress-release-v1/fixed/00-lounge.png
git add -- evidence/company-ornament-ingress-release-v1/fixed/01-books.png
git add -- evidence/company-ornament-ingress-release-v1/fixed/02-plant.png
git add -- evidence/company-ornament-ingress-release-v1/fixed/03-plant-restored.png
git add -- evidence/company-ornament-ingress-release-v1/independent/report.json
git add -- evidence/company-ornament-ingress-release-v1/independent/00-lounge.png
git add -- evidence/company-ornament-ingress-release-v1/independent/01-books.png
git add -- evidence/company-ornament-ingress-release-v1/independent/02-plant.png
git add -- evidence/company-ornament-ingress-release-v1/independent/03-plant-restored.png
git add -- evidence/company-ornament-ingress-release-v1/fixed/video/sourced-ornaments-normal.webm
git add -- evidence/company-ornament-ingress-release-v1/v2/verification-at-release.json
git add -- evidence/company-ornament-ingress-release-v1/v2/verification-after-relocation.json
git add -- evidence/company-ornament-ingress-release-v1/v2/radio-publication.json
git add -- evidence/company-ornament-ingress-release-v1/v2/radio-browser.json
git add -- evidence/company-ornament-ingress-release-v1/v2/radio-restored.png
```
