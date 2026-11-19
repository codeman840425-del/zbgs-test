# 壁挂皂液分配器

| 资源 | 实体构造 | 按压方向 | 出液口局部坐标（米） |
| --- | --- | --- | --- |
| `washroom-dispenser-pump@1` | 外露按泵瓶、壁挂背板、瓶底托座 | 从 +Y 接近按帽 | `[0, .0794, .1155634]` |
| `washroom-dispenser-cartridge@1` | 圆角直压外壳、宽压片、竖向视窗 | 从 +Z 接近压片 | `[0, -.1075, .119]` |
| `washroom-dispenser-lever@1` | 扁角外壳、独立折臂、横向观察窗 | 从 +Z 接近折臂 | `[0, -.113, .119]` |
| `washroom-dispenser-clad@1` | 椭圆筒身、下束箍、短压片 | 从 +Z 接近压片 | `[0, -.097, .119]` |

全款使用 `wall` 与 `room.wall`。原点是墙背中心，背面在 `z = 0`，`+Y` 朝上，`+Z` 朝室内。共同安装包络是宽 0.15 米、高 0.25 米、深 0.14 米。模型固定提供 `dispenser-wall-back`、`dispenser-housing`、`dispenser-actuator` 和 `dispenser-outlet` 四个网格，出液口的几何轴为 `-Y`。安装高度应按实际洗手台、墙面和前方接近空间核定。设施显示静止的器件与实孔口，资源没有使用位和操作状态。

泵式沿用 MiniPoly 原手洗瓶的网格。托座承住瓶底，挂板贴墙，原瓶的按帽从原三角索引中分离为检查节点，保留全部 446 个原顶点、三角面、原始 UV 和三张嵌入贴图。原 GLB、许可和来源摘要随配方保存。另三款的外壳、按压件、托板与真实孔口是项目参数几何，制造商资料仅用作尺寸对照。[MiniPoly 原版及 CC0 许可](https://poly.pizza/m/d4b5btUs1F) · [商用壁挂尺寸参考](https://www.bradleycorp.com/mediamanager/view/8408/6562_Surface_Mounted_Tank-Type_Soap_Dispenser.pdf)

生成器会重新加载导出的每件 GLB，验证尺寸、背面九点接触、装配零件的物理连接、按压件的第一命中，以及出液口贯通和向房内的伸手路径。房间安装验收还需用实际墙面和台面复验。

```powershell
node scripts/company-platform/build-washroom-dispensers.mjs --check
node scripts/company-platform/build-washroom-dispensers.mjs --output output/public-washroom-v1/dispenser/rebuild
node scripts/company-platform/build-washroom-dispensers.mjs --output output/public-washroom-v1/dispenser/wide-example --parameters assets-source/company-washroom-dispenser-v1/examples/wide-clad.json
```

新外观用新 ID 或版本，保持同一个墙装合同。接收工作区采用普通外观发布与复查。示例在同一安装包络内加宽并改变椭圆筒身比例。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-washroom-dispenser-v1/examples/wide-clad.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-washroom-dispenser-v1/examples/wide-clad.json
```
