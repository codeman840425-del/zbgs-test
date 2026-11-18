# Poly Haven 刻花圆几

Ulan Cabanilla 为 Poly Haven 制作的 Round Wooden Table 02，CC0 1.0。`original/` 保留官方 1K glTF、mesh BIN、normal、base color 和 ARM 三张 JPEG 原字节。`recipe.json` 固定每个输入 SHA-256 和官方来源。模型可导入 Blender 查看与编辑，配方控制游戏导出尺寸。另见 [Poly Haven 资产页](https://polyhaven.com/a/round_wooden_table_02)和[许可](https://polyhaven.com/license)。

正式配方将原台面的平面直径调整到 0.52 米，等比保留水平轮廓，台面高 0.50 米，四个支脚落地。底脚、顶面接缝和外边界在锁定的 meshoptimizer 简化中受保护，UV 和法线参与误差评估。网格保留原版四足和雕饰轮廓，使用两件共享同一原版材质的网格。

- `sourced-side-table-body` 保留原几何及已简化的支承，包含用原轮廓重剖的台面外圈。
- `side-table-top` 是原平面真正移出的 0.30×0.22 米矩形，由两三角组成。上下两件没有叠放顶面。借原顶面实际仿射 UV 放置矩形四角。
- `round_wooden_table_02` 保持原版 PBR 参数，三张 JPEG 作为原字节嵌入单个 GLB。成品供普通静态承载，支持面的净高为 0.35 米。

在公司源码根安装 `prototype` 锁定依赖后运行：

```powershell
node scripts/company-platform/adapt-sourced-side-table.mjs
node scripts/company-platform/adapt-sourced-side-table.mjs --check
```

第二制作输入可把 `recipe.json` 复制到工作目录外，调整 `fit.tabletopDiameterMetres`，并输出到独立路径：

```powershell
node scripts/company-platform/adapt-sourced-side-table.mjs --recipe PATH_TO_ALTERNATE_JSON --output PATH_TO_ALTERNATE_GLB
node scripts/company-platform/adapt-sourced-side-table.mjs --recipe PATH_TO_ALTERNATE_JSON --output PATH_TO_ALTERNATE_GLB --check
```

相同字节可重复导出。已有不同字节的目标会拒绝覆盖，制作新版本请给出新的 `--output` 路径。

同一入口会核原文件 SHA、实际 Three.js 读回、固定安装包络、真实承载三角、四脚接触面积和原始贴图字节。离线 Node 读回使用图像对象桩，实际浏览器贴图和最终观感由预览验收检查。
