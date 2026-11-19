# 带货陈列货样

四款挂件共用 `showcase-product` 与 `support-surface`。安装包络为 0.18 × 0.24 × 0.18 米，底部中心贴承载面，+Y 上、+Z 朝观众。四款采用同一 0.38 米／原单位。纸袋在水平面旋转四分之一转，让宽面面向观众。

| 资源 @1 | Kenney 原件 | 实际宽 × 高 × 深（厘米） | 三角数 |
| --- | --- | --- | ---: |
| `showcase-product-bag` | `bag.glb` | 15.65 × 22.79 × 8.36 | 46 |
| `showcase-product-carton` | `carton.glb` | 8.74 × 22.44 × 8.74 | 94 |
| `showcase-product-can` | `can.glb` | 11.40 × 12.16 × 11.40 | 156 |
| `showcase-product-honey` | `honey.glb` | 12.39 × 12.01 × 12.39 | 140 |

`original/kenney-food-kit` 包含作者原 GLB、512 × 512 色卡 PNG 和许可文本。`parameters.json` 固定原 ZIP 条目、归档和各文件 SHA-256。生产只加入刚体朝向、统一比例和贴座变换，把同一张原 PNG 逐字从 `Textures/colormap.png` 嵌入 GLB。原网格、UV、PBR 材质和色卡保持原作者的低多边形风格。[Kenney Food Kit 2.0 与 CC0](https://kenney.nl/assets/food-kit)

## 操作与复产

按现有布局 `add-facility` 传入层架实例作为 `parentId`，在 `attachment.surfaceId` 指向 `lower`、`middle` 或 `top`。前台柜只使用 `top`。货品跟随其承载件的平移和转动；同包络换款保留实例 ID、所选层及原局部位置。

从公司源码根执行。首次生成默认产物用 `--write`。读取试制结果用新目录。

```powershell
node scripts/company-platform/build-showcase-products.mjs --check
node scripts/company-platform/test-showcase-product-assets.mjs output/product-showcase/research/geometry
node scripts/company-platform/build-showcase-products.mjs --parameters assets-source/company-showcase-product-v1/examples/wrapped-v2.json --output output/product-showcase/research/wrapped-new
```

示例 `wrapped-v2.json` 以同一个生产入口加入原 Food Kit 的横放独立包装。新款可在 `designs` 填写独立 ID、版本、中文名、`source`、等比 `metresPerUnit` 和整数 `yawQuarterTurns`。源接受 +Y 向上的静态 GLB 三角，原姿态的可见面由配方转到 +Z。若 GLB 有色图，提供已嵌入 PNG bufferView，或在 `textures` 按原 GLB 相对图像 URI 声明公司资产目录内的 PNG `path` 与 SHA-256。所有声明必须绑定到原模型使用的图像。源条目提供原 GLB、作者及实际书面许可证，可选 `editable: {path, sha256}` 针对另存的原稿。正式成品从自己的 GLB 就能加载全部颜色。
