# 1K 男制服平行厚底鞋

此鞋沿原乐福鞋的外底周圈增加 20 mm 厚度。前掌、足弓、鞋跟同时沿模型 Y 轴向下移动，保留原鞋跟与足弓的高度差。可在[原底与厚底同镜头对照](../../evidence/m2-sole-variant-v1/asset/comparison.png)查看单鞋外侧、双鞋正斜面及双鞋底面。

## 可编辑源和使用条件

- 构造输入是原始制服鞋独立 GLB，SHA-256 为 `9c69190ffd2efc29f8e9b4d04cccef631b78c1fa744689fa57af1f416e70e756`。它从 hecko 发布的 VRoid Project β 0.14.0 男体提取，保留贴图、UV 和六根骨骼的原始绑定。目标是 `source-male-cc0-texture-release-v1`，身体 SHA 前缀为 `2e66ee6c`。[可编辑鞋 GLB](../../prototype/public/assets/raw-male-equipment-v1/raw-male-ab9a-flat-shoes-v1.glb) · [原始制服人物](../foundation-male/Base_Male.vrm)
- 工程另有从同源身体重导出制作的可编辑 Blender 鞋件。重导出的鞋有 566 顶点，原始提取件有 536 顶点，均有 540 个三角形。配方的面选择属于原始提取件；Blender 鞋件可供美术查看原设计。[可编辑鞋件](../m1b/m1b-uniform-shoes.blend) · [重建工序](../m1b/README.md)
- 原 VRM 的元数据声明 CC0，发布者归档说明保存在项目内。pixiv 的旧版 New model 条款允许编辑和使用。原发布页本次远端读取未成功，沿用已归档的发布者页面、下载包指纹和可复核的 VRM 元数据。第三方导出未与 pixiv 发布的同版模型逐字节比对。[本地来源与许可](../foundation-male/LICENSE.md) · [作者页面归档](../foundation-male/publisher-page.html) · [pixiv 原版条件](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model)

## 如何制作

VRoid β 的服装编辑流程把鞋底调整和足部形态调整分开。本工程持有该鞋的已导出几何；参数配方使用 Blender 区域挤出的平行轴规则，在已有鞋底与鞋面之间补侧壁。运行时继续使用已验证的 glTF 蒙皮装备接口。[VRoid β 鞋底参数](https://vroid.pixiv.help/hc/en-us/articles/360000367382--v0-7-0-We-added-new-clothing-shoes-a-feature-to-change-layer-names-and-more-August-3-2019) · [Blender 区域挤出](https://docs.blender.org/manual/en/3.0/modeling/meshes/tools/extrude_region.html)

配方按原作鞋底纹理岛选择每只鞋的 16 个三角形，并按原始角点确认每只鞋的 18 条周边与鞋身相接。鞋底完全位于单独的 UV 区域内。508 个其他三角形逐点保留。新增的 72 个侧壁三角形沿原周圈连接，材质从相邻鞋底纹理岛取样，两端继承原角点的权重。底面原有的纹路、六根骨骼的逆绑定矩阵和脚姿保留。[面选择与尺寸](recipe.json) · [独立产物](generated/equipment.json) · [fit](generated/fit.json)

从项目根目录复建和验证

```powershell
python -B scripts/production/sole_variant.py --check
python -B scripts/production/sole_variant_review.py
python -B scripts/production/sole_variant_test.py
```

生成命令允许通过 `--output` 提供工程内的新目录。复核脚本对新旧 GLB 分别读取原始角点、骨骼、贴图和焊接边，在另一目录重新生成同一份 GLB、fit 和装备清单。CPU 结果显示两脚外底均下降 20.0 mm，上帮顶点最大位移为 0；结果为静态绑定空间的几何与材质检查。动作接地、坐姿和游戏交付由对应运行回执确认。[几何与重建回执](../../evidence/m2-sole-variant-v1/asset/report.json)

登记时使用 `python -B scripts/production/sole_variant.py --publish`。它先比对源包与当前复建结果，再把三个运行文件作为一个目录发布到 `prototype/public/assets/sole-variant-v1`。相同发布可重试，已有不同的文件会保留并返回错误。可用 `--publish --check` 只读复核。
