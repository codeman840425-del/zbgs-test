# 固定展开落地屏风

四款共用 `screen-partition` 的地面安装合同。原点在地面底部中心，+Y 向上、+Z 向前。宽 1.80 米、高 2.00 米、深 0.08 米。轮廓在世界坐标下随实例一起平移或转向。透明玻璃也占用相同的可通行空间。木屏实体铰接件用于表现折屏结构，四款均为固定展开状态。

- 木款使用三片带实体百叶与窗格式嵌板的木框、六组铰接件和三只薄底靴。每片前后各保留一份经缩放的 Kenney `paneling.glb` 原网格。原包、GLB 条目及原许可证均按 SHA-256 固定。 [Kenney Furniture Kit 2.0，CC0-1.0](https://kenney.nl/assets/furniture-kit)
- 布款用薄支框和两只端靴夹持具有轻微褶纹的布面，布边有独立几何缝边。
- 吸声外观款用贴地轨、实心背板与双面错列毡块。材质和块面用于呈现吸声产品的外观。
- 玻璃款用墨色实体框、中央立梃、压条及贴地轨固定两片 12 毫米厚的透明玻璃。玻璃的 PBR 不透明度为 0.22，框、轨和压条为不透明材料。已核同包淋浴门、墙窗与咖啡桌的玻璃为平面，因此另建实体板与固定构造。

制作描述可复用为「为直播工作室制作一款固定展开的屏风；以地面底部中心为基点，在 1.80 × 2.00 × 0.08 米内表现支框、面板和与地面相接的固定件。为木、布、毡块或玻璃选择有真实轮廓差异的构造，保留地面阻挡和版本信息。输出可编辑参数和静态 GLB」。木屏复用了原件，其余构造使用参数建模。

以下命令从项目根运行。每次试导使用一个新目录。

```powershell
New-Item -ItemType Directory -Path output -Force | Out-Null
node scripts/company-platform/build-screen-partition-collection.mjs --check
node scripts/company-platform/test-screen-partition-geometry.mjs output/screen-geometry
node scripts/company-platform/test-screen-partition-placement.mjs
node scripts/company-platform/build-library.mjs --check
```

普通变体只改 JSON。复制默认 `parameters.json`，保留所选构造和它引用的源数据，填入新的 `id` 和 `version`，修改 `parts` 或 `finishes` 后试导。示例用相同的错列毡块构造，将四行改为五行，产出 `screen-partition-acoustic-narrow-tiles@2`。候选的 GLB、资源描述、索引和几何报告写入指定目录。

```powershell
node scripts/company-platform/build-screen-partition-collection.mjs --output output/screen-variant --parameters assets-source/company-screen-partition-v1/examples/acoustic-narrow-tiles-v2.json
```

CPU 检查覆盖实际包络、接地三角形面积、木嵌板来源、两面玻璃与透明材质、安装阻挡和复产哈希。装配构造用于场景表现，实际固定强度、声学系数及浏览器画面分别验收。

## 登记新外观

在制作工作副本安装依赖后，从源码根目录运行以下命令，导出并正式登记示例配方。普通新款可放在自己的 `assets-source/company-名称/` 里，填写新 ID 或升版本。重复执行同一配方会核对既有字节。

```text
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-screen-partition-v1/examples/acoustic-narrow-tiles-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-screen-partition-v1/examples/acoustic-narrow-tiles-v2.json
```
