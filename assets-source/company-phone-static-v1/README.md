# 桌面手机

`parameters.json` 声明四款固定放置的手机。`contract.json` 规定 `phone-static` 的统一安装和开关合同。资源以底部中心落在 `desk.desktop`，屏幕朝局部 +Z，整个 0.18（宽）× 0.19（高）× 0.11（深）米包络参加桌面预留校验。夹持款的双侧爪固定在自己的桌面底座上。

| 资源，均为 @1 | 实际宽 × 高 × 深（毫米） | 三角形 |
| --- | --- | ---: |
| `phone-static-portrait` 竖屏薄座 | 71.9 × 151.5 × 24 | 4168 |
| `phone-static-landscape` 横屏双低脚 | 153 × 82.1 × 29 | 1972 |
| `phone-static-cradle` 楔形托台 | 88 × 163 × 78 | 1984 |
| `phone-static-clamp` 底座侧爪 | 106 × 177 × 93 | 3472 |

环境规格中的 90 × 180 × 30 毫米处于待验证状态。横屏实际宽 153 毫米，托台和侧爪底座实际深 78 和 93 毫米。统一安装包络容纳四种架构，并为同一数据入口的后续配方保留少量余量。

每款 GLB 都有一块独立的 `phone-screen` 屏幕网格和一张内嵌 sRGB PNG。开屏显示绘制的监看示意和音量条，关屏通过同一运行时材质将底色设为黑色并归零自发光。画面是静态示意。

## 素材和适配

竖屏款采用 Grab3D 的 CC0-1.0 `Smartphone`，原文件、作者许可证和清单在 `original/grab3d/`，并在配方中固定 SHA-256。原 `smartphone_body`（3068 三角形）和 `smartphone_glass_1`（500 三角形）同时绕 X 轴旋转 90°，按机身底部中心作平移。机身保留原 UV 并改用项目材质，独立玻璃按实际尺寸重新映射监看图。托脚、屏幕图片和其余三款几何由项目制作。[Grab3D 原作](https://grab3d.com/models/electronics/smartphone/)，[作者许可证](https://grab3d.com/dl/smartphone/LICENSE.txt)，[作者清单](https://grab3d.com/dl/smartphone/manifest.json)。

检查本地 Kenney 官方包后没有采用其中的道具充当手机。Quaternius 的 CC0 手机已查实有可用原始网格，其正面显示区位于混合材质网格中。竖屏正式款采用已经独立建模的 Grab3D 玻璃。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)，[Quaternius Phone](https://poly.pizza/m/k2kgBepoMU)。

## 生产与核查

在项目根运行以下命令。输出参数每次使用新的项目内目录。先有的正式同版本资产只接受相同字节，异字节配方使用新版本和独立输出。

```powershell
node scripts/company-platform/build-phone-static.mjs --check
node scripts/company-platform/test-phone-static-assets.mjs output/phone-static/verified
node scripts/company-platform/build-phone-static.mjs --parameters assets-source/company-phone-static-v1/examples/compact-cradle-v2.json --output output/phone-static/compact-cradle
```

就地首次生成采用 `node scripts/company-platform/build-phone-static.mjs --write`。集合索引为 `collection.json`，每款固定输出 `prototype/public/company-assets/phone-static-v1/<id>/v<version>/model.glb` 与 `resource.json`。

`examples/compact-cradle-v2.json` 是第五款候选，同一个生产器读出新 ID、版本、机身尺寸、饰面、支座剖面和限位唇。生产端每次双重导出比较实际 GLB 字节，加载并射线校验屏幕法向、UV、背面遮挡、底面接触及全部安装尺寸。独立检查还将竖屏两块原模型的顶点与正式 GLB 逐点比较。把第五款托台底座深度由 0.068 改为 0.116 米可重现超包络拒绝。
