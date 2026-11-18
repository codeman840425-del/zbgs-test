# 直播桌面绿植

四款共用 `plant-desktop-installation` 合同。模型以盆底中心为原点，+Y 向上，+Z 朝前。桌面入口是 `desk-surface`，使用直播桌的实际 `surface` 高度。完整的 0.35 × 0.55 × 0.35 米安装包络参加桌面预留，实例随父桌一起移动和转向。静态摆件不占地面通道。

| 资源，均为 @1 | 冠部与花盆 | 实际宽 × 高 × 深（毫米） |
| --- | --- | --- |
| `desktop-plant-bonsai` | 弯干、五个森绿色层冠，椭圆浅盆 | 324 × 348 × 175 |
| `desktop-plant-cactus` | 一根肋纹主柱及两根弯臂，红陶盆 | 208 × 394 × 144 |
| `desktop-plant-broadleaf` | 七片弧形扇叶和七根叶柄，浅色锥形盆 | 243 × 433 × 260 |
| `desktop-plant-succulent` | 二十四片三层莲座厚叶，蓝灰浅盆 | 213 × 129 × 220 |

新冠部由项目建模。盆景和仙人掌改用 `plantSmall1.glb` 的 58 个原盆三角，阔叶保留 `pottedPlant.glb` 的 40 个原盆三角及四个原土面三角，多肉保留 `plantSmall3.glb` 的 58 个原盆三角。各部件按桌面造型做不同尺寸和材质适配，CPU 回读逐顶点核对适配后的原件与 UV。独立示例 `desktop-plant-pointed-kenney@2` 使用不同原件 `plantSmall2.glb`，保留整株 158 个三角和原 PBR、UV，按配方统一缩放、底部居中并转向。已有陈列摆件 `tabletop-plant-kenney@1` 继续使用自己的 `plantSmall3` 整株合同。[Kenney Furniture Kit 与 CC0](https://kenney.nl/assets/furniture-kit)

`original/furniture-kit` 随包提供四个精简 GLB 源和包内许可证原件。每份配方固定原包、原条目、实际 GLB 和许可证 SHA-256。真实盆底始终为 `desktop-plant-pot`，土面为可选 `desktop-plant-soil`，主要冠部为 `desktop-plant-foliage`。

## 使用同一入口生产

从项目根运行，给报告和试导各用一个新目录。

```powershell
node scripts/company-platform/build-desktop-plants.mjs --check
node scripts/company-platform/test-desktop-plant-assets.mjs output/desktop-plants/producer/verified
node scripts/company-platform/build-desktop-plants.mjs --parameters assets-source/company-desktop-plants-v1/examples/pointed-kenney-v2.json --output output/desktop-plants/producer/pointed
```

首次生成固定四款用 `node scripts/company-platform/build-desktop-plants.mjs --write`。同版按文件字节核对。集合为 `collection.json`，输出模型与资源描述位于 `prototype/public/company-assets/desktop-plants-v1/<id>/v<version>/`。试导会重复生成并校验实际包络、带面积的水平盆底接触、冠部和叶片射线。

独立来源用 `form: "stock-plant"`，在同一份配方中的 `sources` 声明本地 GLB、实际作者、授权文本及各自 SHA-256，填写实有 `potNode`、`foliageNode` 和可选 `soilNode`。原包源可附上条目和原包 SHA-256。原作者许可使用 `CC0-1.0` 或 `Project-authorized-original`，后者读取署名者的实际书面授权。整体适配由 `fit.height`、`fit.yawQuarterTurns` 表达。

源可以是纯色 PBR，也可以在 GLB 的 BIN 内嵌基础色 PNG。一个模型最多三张，每张不超过 2048 × 2048、2 MiB，使用 UV0。制作入口逐字节保留 PNG，回读检查实际 sRGB 材质绑定、UV 和采样器。当前入口会明确拒绝图片外链、UV1、贴图变换、其它材质贴图或动画。

在接收工作副本注册第五款时使用正式发布命令。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-desktop-plants-v1/examples/pointed-kenney-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-desktop-plants-v1/examples/pointed-kenney-v2.json
```

## 给制作 agent 的输入

> 制作一盆直播桌上可摆放的绿植。先确定实际冠部轮廓，选择有独立盆底、冠部和明确许可的原件。给出 GLB、本地授权说明及作者和 SHA-256。以盆底中心为原点，实接桌面，在 0.35 × 0.55 × 0.35 米内完成。保留真实叶片和枝干，使用桌面包络检查和公开生产入口。新造型填写独立 ID 和版本，先试导再登记。
