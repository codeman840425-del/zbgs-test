# 台灯资产

四款共用 `desk-lamp` 的桌面安装和状态合同。安装原点在桌面，最大包络为 0.30 × 0.50 × 0.30 米，坐标为 +Y 向上、+Z 向前。每款把 `desk-lamp-diffuser` 的局部 +Z 作为实际出光方向。它随 `desk-lamp-head` 绕自身 +X 轴俯仰。角度单位为弧度，合法范围 −0.35 至 +0.35，正值让光束更向下。默认聚光原点是发光面中心沿法线外移 3 毫米，目标点沿同一轴线再前进 1 米。

鹅颈和条形灯使用项目原创几何。圆罩和柱形灯分别保留了 Kenney Furniture Kit 2.0 中 `lampRoundTable.glb` 和 `lampSquareTable.glb` 的金属底座/支杆以及各自的中空罩体。配方对两种原罩单独定位和缩放，再加转轴、支架和独立的发光面。原包、两个条目及原包许可证均按 SHA-256 固定，原件以 CC0-1.0 发布。 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)

`parameters.json` 定义材质、实体部件尺寸、位置和灯头中位。以下命令从项目根运行，每次使用新的输出目录。

```powershell
New-Item -ItemType Directory -Path output -Force | Out-Null
node scripts/company-platform/build-desk-lamp-collection.mjs --output output/desk-lamp-trial
node scripts/company-platform/build-desk-lamp-collection.mjs --check
node scripts/company-platform/test-desk-lamp-assets.mjs output/desk-lamp-geometry
node scripts/company-platform/test-desk-lamp-runtime.mjs
node scripts/company-platform/build-library.mjs --check
```

要调整部件尺寸或材料，请把 `parameters.json` 复制到项目内的新配方文件，填写新资源 ID 或版本，编辑 `designs` 内对应部件，然后使用同一个生成器输出试样。

```powershell
node scripts/company-platform/build-desk-lamp-collection.mjs --output output/desk-lamp-alternate --parameters output/desk-lamp-parameters.json
```

`--check` 逐字节比较已登记产物。预导出的 `report.json` 记录各角度的网格包络、实际出光射线和桌面落点。独立测试回读已登记 GLB，核对 Kenney 源三角、顶点、UV、PBR 参数和四款轮廓。

## 登记新外观

在制作工作副本安装依赖后，从源码根目录运行以下命令，导出并正式登记示例配方。普通新款可放在自己的 `assets-source/company-名称/` 里，填写新 ID 或升版本。重复执行同一配方会核对既有字节。

```text
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-desk-lamp-v1/examples/a-frame-reading-v1.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-desk-lamp-v1/examples/a-frame-reading-v1.json
```
