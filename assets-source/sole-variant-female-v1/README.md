# 1K 女制服鞋的 20 毫米平行厚底版

款式为 `uniform-platform-shoes-v1`，版本为 `parallel-20mm-v1`。此版使用 `source-female-uniform-texture-v1` 的原鞋上帮、纹理和六骨绑定。在原作外底与上帮的接缝处增加侧壁，左、右脚的鞋跟和前掌一起加厚。源鞋与成品身份由[配方](recipe.json)和[独立回读](readback.json)记录。

## 制作来源

hecko 发布了旧 VRoid Studio β 0.14.0 的 Base_Female 导出。原 VRM 的元数据声明 CC0。项目归档记录了发布者说明、下载包与 VRM 摘要，以及旧版 New model 条款。与同版官方导出的逐字节比对仍待核验。[来源与条款记录](../foundation/source.json)

1K 女体沿用 Base_Female 重导出的独立制服鞋 `m1-uniform-shoes.glb`。M1 的 Blender 鞋件可编辑，包含鞋面、骨架、UV 与嵌入纹理。实际生产输入为 190,988 字节的独立 GLB，SHA-256 以 `c4e4178a` 开头。目标身体 SHA-256 以 `1049f87a` 开头。[原鞋制作与拆分](../m1/README.md) · [可编辑源](../m1/m1-uniform-shoes.blend) · [原鞋登记](../../prototype/public/assets/female-uniform-texture-release-v1/equipment.json)

女鞋原外底 UV 岛各含 16 个三角形，按原始面序为 237–252 和 488–503（首尾均含）。每只鞋的外底与上帮有 18 条共边。制作器将外底平移 20 毫米，为两圈合计补入 72 个侧壁三角。508 个鞋面三角的顶点位移为零。原纹理、UV、权重和逆绑定逐项回读一致。成品有 714 个顶点、612 个三角形，鞋面和鞋底接缝新增开边为零。[女体适配](generated/fit.json)

## 从项目根目录复建

```powershell
$recipe = 'assets-source/sole-variant-female-v1/recipe.json'
python -B scripts/production/sole_variant.py --recipe $recipe
python -B scripts/production/sole_variant.py --recipe $recipe --publish
python -B scripts/production/sole_variant.py --recipe $recipe --publish --check
python -B scripts/production/sole_variant.py --publish --check
python -B scripts/production/sole_variant_test.py -v
```

第一条生成命令在配方旁的 `generated` 目录写入 GLB、装备清单和 fit。已有完整产物会逐字节复核。可用 `--output 新目录` 独立复建。发布入口将相同三件作为一组送到 `prototype/public/assets/sole-variant-female-v1`。遇到不完整或不同的目标目录时保留现场并报错。省略 `--recipe` 仍重建原男款。

登记输入为[女体候选片段](style-fragment.json)。装备 ID 为 `female-uniform-platform-shoes-v1`，fit ID 为 `female-uniform-platform-shoes-v1-fit`。本回读覆盖静态模型、绑定和发布字节。坐起、步行及换鞋接地需按固定游戏构建单独验收。
