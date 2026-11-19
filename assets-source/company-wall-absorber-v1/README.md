# 直播房墙装吸音板

四款墙板共用背面中心挂点。宽 0.60 米、高 1.20 米、厚 0.08 米；背面位于 Z=0，正面朝 +Z。蜂窝毡块的倒角和缝隙、木格条、软包鼓面、交错泡棉棱脊都有实体网格。材质属于照明可影响的 PBR 材质。资源提供声学布置标签；本族没有实测吸声性能数据。

| 配方 kind | 实际构造 | 可编辑参数 |
| --- | --- | --- |
| honeyfelt | 交错排列的六边形倒角毡块，各块背面贴墙 | columns、rows、gap、三种毡色 |
| timber | Kenney 压边木底板和独立实体格条 | slats、gapFraction、木色和底色 |
| upholstered | 连续背板、开缝的独立曲面布包 | columns、rows、seam、布色和缝底色 |
| foam | 粘合背板和朝向交错的锥台棱面 | columns、rows、ridgeFraction、泡棉色 |
| dcc | 外部工具已完成的静态实体 GLB，导入保留原文件字节 | source 记录模型、署名、许可，可附可编辑源 |

## 生成、验证与发布

在可编辑工程根目录安装 prototype/package-lock.json 固定的依赖。试制选用新的目录。生成器随每个卡保存配方、生成脚本、来源与许可哈希。collection.json 包含模型、安装包络以及 Three.js 回读的正背面、侧面、网格件和接触射线记录。

```powershell
npm ci --prefix prototype
node scripts/company-platform/build-wall-absorber.mjs --write
node scripts/company-platform/build-wall-absorber.mjs --check
node scripts/company-platform/build-wall-absorber.mjs --parameters assets-source/company-wall-absorber-v1/examples/felt-wide-v2.json --output output/my-felt-proof
node scripts/company-platform/build-wall-absorber.mjs --parameters assets-source/company-wall-absorber-v1/examples/timber-chevron-v2.json --output output/my-chevron-proof
```

在独立交付包的可编辑 source 目录沿用同一套命令。对照无误后使用通用入口发布并登记，既有房间保存的资源版本可继续使用。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wall-absorber-v1/examples/timber-chevron-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wall-absorber-v1/examples/timber-chevron-v2.json
```

## 独立 DCC 输入

人字木格的可编辑文件是 original/author-chevron.py。它用 Blender 创建背板、两种木质材质与八对削边格条。项目用 Blender 4.5.9 LTS 验证。可更改排数、角度、截面或材料后输出到新的工程内路径。下例由已安装的 Blender 命令在后台执行。

```powershell
blender -b --factory-startup --disable-autoexec --python-exit-code 1 --python assets-source/company-wall-absorber-v1/original/author-chevron.py -- output/wall-absorber-v1/production/my-chevron.glb
```

将自产的 GLB、许可说明及可编辑源放入本族的 original 目录，采用新的文件名。复制 examples/timber-chevron-v2.json，填写独立版本及署名，并更新 source.path、source.sha256、source.licenseFile 和可选 source.editable 的路径、SHA-256。使用同一 ID 和新版本可保留墙上实例。普通结构参数也可使用新 ID。

GLB 使用米制、+Y 向上、+Z 朝房内、实体三角面和单场景，无动画、蒙皮和灯光。贴图随 GLB 嵌入，支持不透明带光照的 PBR 表面和 PNG/JPEG。各独立装配部件应保留相应网格，以便核验背贴墙与部件间支承。工具会逐网格检查有无通向墙背的实体接触，并记录被采样的部件数；胶合、墙体紧固件的强度属于实物设计。

## 来源

木格基础款保留 Kenney Furniture Kit 2.0 中 paneling.glb 的压边木面网格与原木材质，另加本项目实体格条。原文件、CC0 许可、发布包及内部条目见 original/sources.json。毡块、软包、泡棉、微表面纹理和人字木格为 Company Studio 环境制作组原创。项目署名与使用条件见 original/PROJECT-SOURCE.txt。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)

Autex Groove 用角形切面形成受光起伏，并提供直接贴墙的安装方式。本项目据此参照表面深度与贴墙原则，图案、几何、材质和尺寸均由本项目配方确定。[Autex Groove 产品说明](https://www.autexacoustics.com/product/groove/)
