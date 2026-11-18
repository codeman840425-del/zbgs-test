# 踢脚线与墙地收边

四款固定规格均来自环境分支 `baseboard-and-edge`。沿墙长度由房间边界决定，截面最大入房深度为 20 毫米，最大高度为 120 毫米。材质和截面均可由配方编辑。每款的 GLB 是本地 X 轴 1 米长的闭合样段，+Y 向上，+Z 从墙背朝房间。

| 资源 | 截面和饰面 |
| --- | --- |
| `baseboard-square@1` | 米白哑光，正面连续直角 |
| `baseboard-reveal@1` | 深灰阴影缝，上口退进 9 毫米 |
| `baseboard-timber@1` | 蜂蜜色沿墙木纹，15 毫米半径圆唇 |
| `baseboard-stone@1` | 暖灰石纹，斜切上口 |

`profile` 列出轮廓顶点 `[depth,height]`，单位米，沿轮廓依次给出，无需重复起点。轮廓须达到最大高度和深度，在墙背和地面各有一条非零长度接触边。轮廓可以凹入。相交、相触的非相邻边和相邻回折会被拒绝。

`finish-surface` 是饰面读取节点。每个 GLB 包含同目录的 `texture.png` 原始字节，采用 sRGB 颜色贴图并在两轴重复。PNG 为项目程序生成，由已锁定的 pngjs 编码。可编辑配方中的 `tileMeters` 指定现实米制重复周期。

从项目根目录执行。每个试导位置需是新目录。

```powershell
New-Item -ItemType Directory -Path output/baseboard-assets -Force | Out-Null
node scripts/company-platform/build-baseboards.mjs --check
node scripts/company-platform/test-baseboard-assets.mjs output/baseboard-assets/asset-check
node scripts/company-platform/build-baseboards.mjs --output output/baseboard-assets/sage-candidate --parameters assets-source/company-baseboard-v1/examples/reveal-sage-v2.json
```

要创建普通变体，复制设计配方，填写新 ID 和版本，调整截面或材料，使用同一生产入口预导。示例改变退槽高度、上口厚度和涂料，生成 `baseboard-reveal-sage@2`。独立试导生成 GLB、PNG、`resource.json` 和可接入资源库的 `collection.json`。已登记资源可用 `--check` 逐字节复产校验。CPU 检查覆盖端盖与轮廓、墙地接触、透明度、GLB 内外纹理一致和三种非法轮廓。

完成试导后，从可写的制作副本运行现有房间饰面发布命令。发布时固定配方快照，一并登记 GLB、PNG 和资源描述。重复检查可传入原配方或发布结果中的 `sourceParameters` 快照路径。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-baseboard-v1/examples/reveal-sage-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-baseboard-v1/examples/reveal-sage-v2.json
```

把发布结果中的资源 ID 和版本用于房间的 `baseboard` 饰面。调整已发布资源时填写新版本。发布器会保留旧版本，任一产物字节变化都会使原版本检查失败。
