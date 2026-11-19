# 开放衣架与静态挂衣陈列

两类资源在同一 `collection.json` 中生产。架体为 `garment-rack-wardrobe` 的四种开放结构，衣物为四种 `hanging-garment`。各架可在地面放置，挂衣直接选择架上的空位。衣料和衣架均为静态场景资产。

| 正式架体，均为 @1 | 构造 | 实际宽 × 高 × 深（毫米） |
| --- | --- | --- |
| `garment-rack-portal` | 两根钢立柱、顶横框和深矩形落地足 | 947 × 1704 × 442 |
| `garment-rack-a-frame` | 两侧三角斜撑，四角脚片 | 917 × 1625 × 470 |
| `garment-rack-cantilever` | 单侧后柱与悬臂，横向落地底架 | 916 × 1748 × 435 |
| `garment-rack-trestle` | 斜向木立柱，成对交叉木脚 | 927 × 1569 × 396 |

夹克、短袖、无袖伞摆裙与连帽卫衣分别为 `garment-hanging-jacket`、`garment-hanging-shirt`、`garment-hanging-dress`、`garment-hanging-hoodie`，版本均为 @1。各款由实际厚布边、垂褶和衣架制作，轮廓、领口、袖型及缝线可编辑。默认材质不透明，可供同一挂位换款。

## 地面与挂位

衣架以底部中心落地，+Y 向上，+Z 朝前，固定包络 1.00 × 1.80 × 0.50 米。前方留空在架体局部 X ±0.44 米、Z 0.25–0.85 米。每架共用一个与 X 轴平行的实心圆杆 `garment-rail`，轴线 Y=1.50、Z=0，半径 0.015 米。`left`、`right` 对应 X=-0.24、+0.24，杆顶统一 Y=1.515 米。

子件在 `attachment.slotId` 选取挂位。子件的原点是杆顶，肩线沿 Z，向局部负 Y 下垂。`hanger-hook` 的内弧以实际面接触杆顶，`garment-hanger` 承托 `garment-cloth`。衣物固定包络宽 0.14、下垂高 0.86、深 0.432 米，钩冠容许在原点上方 0.010 米内。CPU 逐款读回脚底、圆杆、钩内侧、衣架与布面，并用架体真实三角和衣物包络核对 32 个架、衣、挂位组合。

布面在加褶前对相邻三角共用的边统一细分，GLB 回读时检查每条布面边恰有两张方向相反的邻面。缝线连续沿实际前表面生成，配方中的路径及点间线段须落在布面上。回读从路径两侧打射线检查缝线是否与布面贴合。

## 源和许可

木脚款使用 Kenney Furniture Kit 2.0 的 `Models/GLTF format/coatRackStanding.glb`。从实际网格选取 Y≤0.1036 米的原脚 52 个三角，每侧放入一份，保留原 UV 并重新指定木材 PBR。侧架与横杆由项目建模。独立复核逐顶点对比了宣告变换后的原脚模型。原 GLB 和许可证在 `original/furniture-kit`，`parameters.json` 记录原包、条目、实际 GLB 和许可 SHA-256。墙挂五钩件的落地和杆形与本组规格有差异。[Kenney Furniture Kit 与 CC0](https://kenney.nl/assets/furniture-kit)

其余架体、衣型、钩和缝线由项目制作。若衣型使用外部作者的布纹，在 `sources` 记录 `kind: "png"`、本地 `path`、`sha256`、`author`、`license`、`licensePath` 和 `licenseSha256`。用设计的 `source` 指向该条目。许可可为 `CC0-1.0` 或 `Project-authorized-original`，后者保留作者实际书面授权。PNG 限 2048 × 2048 像素、2 MiB，实际颜色字节嵌入 GLB 的 `garment-cloth` 材质并绑定 sRGB UV0。纹理按 Z/Y 走向覆盖布面。

如另有可编辑的布纹原稿，在同一个 `sources` 条目加入 `editable`，对象只含 `path` 和 `sha256`。路径使用项目内 `assets-source/company-*/` 下的真实文件，哈希使用小写 SHA-256。发布将原稿记入 `provenance.dependencies.editableSource` 并随包移交。直接导出、发布、离线索引检查和打包均读取原稿并核对哈希。修改已登记原稿时使用新的文件路径和资源版本。

## 复产和新款

从项目根运行。每次报告及预览导出使用新目录。

```powershell
node scripts/company-platform/build-garment-rack.mjs --check
node scripts/company-platform/test-garment-rack-assets.mjs output/garment-rack/producer/verified
node scripts/company-platform/build-garment-rack.mjs --parameters assets-source/company-garment-rack-v1/examples/bell-sleeve-v2.json --output output/garment-rack/producer/bell
```

首次生成固定资源采用 `--write`。同一 ID 和版本已有文件时逐字节核对。正式 GLB 和描述位于 `prototype/public/company-assets/garment-rack-v1/<id>/v<version>/`。网格按配方重做两次以核对导出稳定性。带自有布纹的离线样本也已通过 PNG 字节回读，改错素材哈希时没有输出。

第五款 `garment-hanging-bell-sleeve@2` 完全由示例 JSON 定义。新衣型修改 `shape.outline` 的 [Z, Y] 点、`thickness`、`fold`、`hangerHalfWidth` 和 `seams`。新架型可调整构造类型和尺寸参数，保留杆、挂位、落地和前方净空要求。木架换用另有书面许可的 GLB 脚件时可声明 `kind: "glb"`，给出本地源、实际 `mesh` 和原件截取 `footTop`。新款选择独立 ID 或版本并先试导，再用通常的发布入口登记。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-garment-rack-v1/examples/bell-sleeve-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-garment-rack-v1/examples/bell-sleeve-v2.json
```

制作指令可以写成「制作一件静态挂在开放衣架上的陈列服。以顶钩与杆顶相触为原点，肩线沿 Z，衣服下垂。给出新 ID、版本、显著袖/领/裙摆轮廓及可编辑配方。布纹可提供单个授权 PNG。用原生产器导出，验证顶钩、前方净空、挂衣包络和整体真实几何。」
