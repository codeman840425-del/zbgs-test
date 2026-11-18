# 落地伸缩直播背景幕

四款共用 `background-fabric` 地面安装合同。底部中心是原点，+Y 向上，+Z 为幕面正面。通行检查使用 2.10 × 1.93 × 0.30 米安装包络；收起后双足和底盒仍占地。旧环境规格中的 3.0 × 2.4 × 0.08 米为待验证的参考。本组采用带双脚的便携落地结构。

| 资源，均为 @1 | 构造和布面 | 实际宽 × 高 × 深（毫米） |
| --- | --- | --- |
| `backdrop-fabric-green` | 矮圆角盒、窄边顶轨、条靴双足、低幅褶绿布 | 2079 × 1909 × 264 |
| `backdrop-fabric-blue` | 圆卷筒、斜翼脚、加厚布边、六褶蓝布 | 2078 × 1915 × 286 |
| `backdrop-fabric-print` | 倒角盒、木色外张脚、织边与矿彩拱廊印花 | 2088 × 1918.5 × 286 |
| `backdrop-fabric-sheer` | 低银盒、椭圆脚、波褶皱边、半透纤维织纹 | 2052 × 1905 × 278 |

幕布、顶轨和后置伸缩杆分别是 `fabric-sheet`、`lift-rail`、`lift-mast`。三个作用网格均为同父级的恒等变换 Mesh。幕面低边在 0.11 米，展开顶边在 1.89 米，真实网格包含 36 道纵向分段。随顶边移动的轨条包含搭接后杆的短托，双脚、底盒、出布唇和卷轴为固定几何。GLB 姿态为全展开，房间以 `state.deployment` 记录从收起到全开的进度。绿蓝幕提供相应的静态背景色。

## 贴图和许可

配方、构造及拱廊画面由本项目制作。幕面的纤维明度和纱布局部透明度源自仓内 `ceiling-woven@1` 的原创程序纹样，输入 PNG 和 SHA-256 由 `contract.json` 固定。颜色和局部印花重新组合为每件内嵌的 288 × 256 sRGB PNG，无外链。前三款布面不透明，纱幕 PNG 实测 alpha 为 97 至 233，PBR 材质启用 alpha blend，材质不透明度为 0.58。现有窗帘是贴窗横向滑帘，旧布件未作为落地卷幕几何导入。

## 配方和复产

在项目根执行以下命令，并为报告与试导选择新的项目内输出目录。

```powershell
node scripts/company-platform/build-backdrop-fabric.mjs --check
node scripts/company-platform/test-backdrop-fabric-assets.mjs output/backdrop-rail/producer/verified
node scripts/company-platform/build-backdrop-fabric.mjs --parameters assets-source/company-backdrop-fabric-v1/examples/river-print-v2.json --output output/backdrop-rail/producer/river
```

首次生成正式四款用 `node scripts/company-platform/build-backdrop-fabric.mjs --write`。已存在的同版产物逐字节核对。集合元数据为 `collection.json`，各版本 GLB 和资源描述位于 `prototype/public/company-assets/backdrop-fabric-v1/<id>/v<version>/`。

第五款「河岸暮色」仅由示例配方生成。可继续修改印花色、构图、褶幅、脚形和轨条，沿同一入口试导新 ID 或版本。生产器重复导出并比较字节，然后读回实际 Mesh、双脚接地面积、局部坐标、正面射线与 UV、收起后的顶轨高度及纹理透明度。将第五款脚深由 0.263 米改到 0.312 米可复现超包络拒绝。
