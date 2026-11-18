# 直播墙挂氛围灯

四款共用 `ambient-led-and-neon` 墙面安装规格。以建筑内墙面的背部中心为原点，+Y 向上，+Z 朝房间，安装包络 0.62 × 0.35 × 0.04 米。墙接部件保留实测正面积的背面。每款只有一个 `ambient-diffuser` 导光网格及一个局部补光点，仍使用公司的实时灯预算。

| 资源，版本均为 @1 | 造型 | 实际宽 × 高 × 深（毫米） | 三角形 |
| --- | --- | --- | ---: |
| `wall-ambient-strip` | 三段贴壁灯槽和分开的导光条 | 500 × 173 × 40 | 2400 |
| `wall-ambient-star` | 闭合圆角星形导光管，中心穿透 | 331 × 313 × 39.8 | 3780 |
| `wall-ambient-wash` | 金属背板和浅罩式壁洗灯 | 204 × 83.5 × 38.6 | 42 |
| `wall-ambient-studio` | 实体底牌和开播徽记 | 390 × 271 × 39.5 | 720 |

`on`、`intensity` 和 `colorHue` 使用现有状态编辑和存档。默认启用，强度 4 cd，色相 30°。色相支持 0–359°，光强支持 0–8 cd。关闭后导光实体保留灰白材质。各款灯点在实际 +Z 导光面的前后 5 毫米内，按同方向射入房间。灯带、星、壁洗和徽记的实测间距分别为 0、1.45、4.56、0.50 毫米。

## 原件和许可

- 灯带、星和徽记分别读取原作者 ZIP 的 `signal3.png`、`star.png` 和 `power.png`。灯带的三段长度来自实际 alpha 连通分量，星形将 alpha 外轮廓拟合成圆角导光管，徽记将开环和中竖的实际轮廓挤出为实体。原三个 PNG 和原始 CC0 许可在 `original/game-icons`。原包 SHA 与文件 SHA 在 `parameters.json`。[Kenney Game Icons](https://kenney.nl/assets/game-icons) · [Kenney 的原作者发布](https://opengameart.org/content/game-icons)
- 壁洗灯读取 `original/furniture-kit/lampWall.glb` 的两个原网格。XY 整体同比 0.90，Z 缩放 0.257，保留 42 个原三角的拓扑和接墙平面。外壳和导光材质在本项目重新指定。原件及作者 CC0 许可均随包，另记录原 ZIP 与成员名称。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)
- 第五款「双峰直播声波」采用项目原创 `original/studio-wave/wave-shape.json` 与生成的 `wave.png`，项目授权说明和三文件 SHA 随源。生产器重新光栅化点列并逐字节核对对应 PNG，导出的 GLB 版权字段读取该配方的实际作者和授权。

## 复产和新轮廓

项目根目录下运行以下命令。给报告、临时 PNG 和试导选择新的项目内路径。

```powershell
node scripts/company-platform/build-wall-ambient.mjs --check
node scripts/company-platform/test-wall-ambient-assets.mjs output/wall-ambient/producer/verified
node scripts/company-platform/build-wall-ambient.mjs --rasterize assets-source/company-wall-ambient-v1/original/studio-wave/wave-shape.json --output output/wall-ambient/producer/wave-rebuilt.png
node scripts/company-platform/build-wall-ambient.mjs --parameters assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json --output output/wall-ambient/producer/studio-wave
```

首次生成默认四件使用 `node scripts/company-platform/build-wall-ambient.mjs --write`。它核对已有同版的真实字节。集合索引为 `collection.json`，正式模型和资源描述位于 `prototype/public/company-assets/wall-ambient-v1/<id>/v<version>/`。试制只写指定目录。第五款用同一个生产入口，从原创轮廓导出真实几何，可直接以 `wall-ambient-studio-wave@2` 试制。

新配方可直接指定授权 PNG，或指定自制无纹理、独立的 GLB，命名其中的金属壁接部件和导光件并在源描述中填写名称。声明实际作者、实际许可文件和来源 SHA，支持 `CC0-1.0` 或 `Project-authorized-original`。原包身份与成员路径按需提供。PNG 可以从委托方提供的轮廓生成，使用内置点列格式时，将可编辑文件加入 `source.editable`。交付副本可用通常的资源发布入口登记新版本。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json
```

CPU 核对四款导光网格、空心区域、分段、贴墙正面积、射线法向和射灯位置。独立验证还逐顶点比较壁洗原件，最大适配误差小于 4 纳米。第五款的两次独立导出与源 PNG 重生均一致，替换来源哈希会拒绝试导。
