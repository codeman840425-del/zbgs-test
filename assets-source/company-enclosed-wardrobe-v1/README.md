# 开播准备间双门衣柜

| 正式款式 @1 | 保留的门部件 | 适配后每柜三角数 |
| --- | --- | ---: |
| `enclosed-wardrobe-timber` 蜂蜜木门 | 书柜左右木门和金属拉手 | 848 |
| `enclosed-wardrobe-framed` 深框木芯 | 双开吊柜的框、嵌板和细长拉手 | 900 |
| `enclosed-wardrobe-inset` 象牙凹嵌门 | 浴柜原木门与面板，右扇镜像，黄铜圆钮为项目制作 | 1264 |
| `enclosed-wardrobe-glass` 烟青窄框玻璃 | 入口门框、独立窄窗和向外的一副五金，右扇镜像 | 1012 |

原件在 `original/furniture-kit`，配方记录每件 GLB、许可和原 ZIP SHA-256。导出以具名原门节点取原网格，保留板、框、嵌板、玻璃的真实三角，将原拉手按实用尺寸独立适配。玻璃保留原 0.50 透明度，着色为烟青。镜像同步修正三角绕序。柜体、落地基座、内杆、固定铰支座和活动铰桶为项目制作。[Kenney Furniture Kit 与 CC0](https://kenney.nl/assets/furniture-kit)

## 共同安装规格

柜体尺寸 1.00 × 1.80 × 0.58 米，落地中心原点，+Z 朝前。左右门轴为 X ±0.469、Y 0.08、Z 0.260 米。每扇门高 1.64 米、宽 0.467 米，分别从闭合向外旋转 −90°、+90°。`leftOpen` 和 `rightOpen` 各自取 0–1。移动节点为 `wardrobe-left-pivot` 和 `wardrobe-right-pivot`，门面、拉手、铰桶及可选窗面都在各自门轴下。固定支座 `wardrobe-hinge-mounts` 留在柜体上。

沿 X 的 `garment-rail` 固定轴高为 1.50 米，半径 0.015 米。左右挂位在 X ±0.24、Y 1.515、Z 0，兼容已有陈列挂衣。两门独立开启时都保持至少 38 毫米的门背与挂衣包络间距。房间规划还需遵守柜前净空及打开中的单门扫掠。

## 改款与复产

从项目根运行，替代配方写入新目录。

```powershell
node scripts/company-platform/build-enclosed-wardrobe.mjs --check
node scripts/company-platform/test-enclosed-wardrobe-assets.mjs output/enclosed-wardrobe/producer/geometry
node scripts/company-platform/build-enclosed-wardrobe.mjs --parameters assets-source/company-enclosed-wardrobe-v1/examples/framed-knob-v2.json --output output/enclosed-wardrobe/producer/framed-knob
```

首次默认导出使用 `--write`。独立示例将原框芯门的细长拉手换为有轴座的圆钮，并改用落地底台。用 `body.base` 选择底台或支脚，用 `panels` 指定原门材料和所承担的物理部位，用 `handle` 编辑适配区间、位置和形态。导出后读回真实门面、把手、双轴、两边落地、两挂位和玻璃射线。配方更改使用新资源 ID 或版本。

如提交另一位作者的门，提供自包含、无贴图和动画的 PBR GLB，门下原始材质须各自可按名称选择。用 `nodes.left` 和 `nodes.right` 指明两扇原节点，或用 `nodes.left` 与 `mirrorRight: true` 明确同源镜像。附有效书面许可、作者、GLB SHA-256 和许可 SHA-256。如还提供编辑文件，`source.editable` 记录同一项目内 `assets-source/company-*/` 下的 `path` 和实际 `sha256`。有玻璃的原件须有独立真实透明窗面。
