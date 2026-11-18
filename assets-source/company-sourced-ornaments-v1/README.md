# 桌面陈列摆件配方

书组、小盆栽、复古收音机与开口纸盒分别使用 Kenney Furniture Kit 2.0 的四个独立模型。原 ZIP 的 `License.txt` 声明 CC0，可用于个人、教育和商业项目。每份配方均固定原包、原 GLB 条目及原许可证的 SHA-256。ZIP 中同名 DAE 可导入编辑，制作以固定 GLB 为输入。收音机和纸盒使用静态陈列合同。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)

配方声明资源身份、源路径、许可、坐标、填充比例与附加转向。`source.path` 相对于项目根。原包输入增加 `archiveEntry` 和 GLB 条目自己的 `modelSha256`，可同时声明 `licenseEntry` 和 `licenseSha256`。直接 GLB 输入使用文件路径与 `sha256`，省略 ZIP 条目字段。`metresPerUnit` 将源单位换算为米，`up` 与 `forward` 使用垂直的带符号坐标轴。`yawQuarterTurns` 为 0 至 3，`fill` 为 0 到 1 之间的正值。更换来源或尺寸时，复制配方，并使用新资源身份或版本发布。

适配器以真实网格三角确定包围盒，只添加整体轴向或转角、统一缩放及底部居中平移。原节点、网格、UV、材质和原 BIN 字节全部保留。输入图像可来自原有的 BIN `bufferView`，也可来自同一 GLB JSON 里的 `data:image/png;base64` 或 `data:image/jpeg;base64`。适配器检查 URI 中的图像编码和尺寸，把原图字节追加到四字节对齐的 BIN `bufferView`，并移除 URI。没有重新编码。输出继续使用现有运行时的单文件合同，外部图像链接拒绝。data URI 限每张 8 MiB、合计 16 MiB，宽和高各不大于 4096 像素。

实际包络固定使用 `tabletop-ornament` 的 0.16×0.20×0.12 米（宽×高×深），物件由实际底面支承。父部件仍以其原 `support-surface` 合同接收摆件。离线读回验证网格和承载，实际贴图显示由浏览器验收检查。

在公司源码根运行以下命令。不同字节的目标拒绝覆盖，正式登记由发布入口处理。

```powershell
node scripts/company-platform/adapt-tabletop-ornament.mjs --recipe assets-source/company-sourced-ornaments-v1/tabletop-books-kenney-v1.json --output NEW_BOOKS.glb
node scripts/company-platform/adapt-tabletop-ornament.mjs --recipe assets-source/company-sourced-ornaments-v1/tabletop-plant-kenney-v1.json --output NEW_PLANT.glb
node scripts/company-platform/adapt-tabletop-ornament.mjs --recipe assets-source/company-sourced-ornaments-v1/tabletop-books-kenney-v1.json --output NEW_BOOKS.glb --check
```

`tests/wall-bear-rejected.json` 使用同一原包的真实壁饰，最低三角没有正面积水平支承。按相同命令传入该配方，应得到 `ornament-no-floor-contact`，并保留目标路径原状态。

```powershell
node assets-source/company-sourced-ornaments-v1/tests/test-embedded-ornament-images.mjs
```

图像回归以既有 Kenney Food Kit 杯身和原 PNG 制作临时单文件探针。另从同一张图生成 JPEG，仅用于验证 JPEG 输入。脚本检查原 BIN、贴图 SHA、sRGB 颜色贴图、UV、材质、确定性导出及错误拒绝，并确认原两份无贴图产物摘要不变。杯子探针不登记为新外观。
