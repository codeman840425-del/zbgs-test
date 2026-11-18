# 宽扶手双人沙发

两种宿主从既有的项目自制模块沙发和拱背沙发制作。配方锁定原资源 sidecar 的 SHA256；sidecar 再锁定原 GLB。每款只替换原右扶手，在座面外侧安装接地的宽软包扶手，并使用该款右座的面料。两个原座点、坐垫、靠背和进出点沿用原资源。

| 宿主 | 原资源 | 承载面 |
| --- | --- | --- |
| `sofa-textile-modular@1` | `sofa-modular@1` | `textile-rest` |
| `sofa-textile-arch@1` | `sofa-arch@1` | `textile-rest` |

在沙发本地坐标中，承载矩形为 X 0.96～1.40 米、Z −0.21～0.21 米，顶面 Y 为 0.70 米，净高 0.15 米。使用 `parentId` 指向实际宿主实例、`attachment.surfaceId` 为 `textile-rest`，将底面为原点的子件放在 `[1.18,0.70,0]`。0.40 × 0.15 × 0.36 米的子件在 0° 和 90° 时分别离右座声明的使用区 4 厘米和 6 厘米。两个新版可互换。原窄扶手沙发使用各自的历史资源和存档。

在源码根目录执行：

```powershell
node scripts/company-platform/build-sofa-textile-hosts.mjs --output output/fresh-sofa-hosts
node scripts/company-platform/build-sofa-textile-hosts.mjs --check
node scripts/company-platform/test-sofa-textile-hosts.mjs
```

`--output` 使用尚未存在的目录。`--write` 安装缺少的本版文件，并核对已存在文件的字节。输出目录中的 `sofa-textile-host-geometry-v1.json` 包含五款原沙发的实测尺寸、座面和靠背接触，以及两个新宿主的承载面与地面射线、保留网格和转向后座位通达结果。角色坐下与离座的动作观看另行验收。
