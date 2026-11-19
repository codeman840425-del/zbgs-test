# 可换印面的公共导视牌

四张印面分别标明来宾签到、培训报到、电梯和楼梯。每张沿用信息板的正面中心挂点，宽 0.88 米、高 0.56 米，正向为 +Z，独立支持显示和隐藏。可将印面安装在已登记的墙装板和落地板上。

## 制作与复产

在可编辑工程根目录运行。Node 使用 prototype/package-lock.json 固定的 Three.js 版本。Python 需有随包 requirements.txt 指定的 Pillow 12.1.0 和 fonttools 4.64.0。

```powershell
npm ci --prefix prototype
python -m pip install -r assets-source/company-information-v1/requirements.txt
node scripts/company-platform/build-wayfinding.mjs --check
node scripts/company-platform/build-wayfinding.mjs --output output/my-wayfinding-proof --parameters assets-source/company-wayfinding-v1/examples/training-orientation-v2.json
```

初次构造四张正式印面可用同一命令的 `--write` 参数。试制目标选用一个尚未存在的目录。每版输出 model.glb、resource.json 和 texture.png。GLB 自带全分辨率 PNG，外置的 PNG 与实际材质引用的像素流逐字节相同。collection.json 还记录两三角面、UV、字形来源、标题和副题的像素边界、220 像素缩图的实际墨迹边界与对比度。

## 修改图文

1. 复制 parameters.json 中的一个 design 到新的配方，保留 schema 和 version。填写新版本、署名、标题和副题。purpose 可取 arrivals、training、lift、stairs，同 ID 的后续版本延续原用途。
2. 从 artwork.json 的四个版式和四个图标中选择，或在新配方中提供独立 icon 名及 iconPaths。路径坐标范围为 0 至 256，支持线段、描边矩形、实心矩形、椭圆和多边形。palette 给出背景纸、标题墨色、强调色、图标底色和前景色。长字、缺字或对比不足会在复产前报出。
3. examples/training-orientation-v2.json 将培训标题替换为“新人报到”，副题改为“主播培训 · 第二场”，并自带讲师与课板的矢量轮廓。原四张印面保持原有版本。
4. 用上一步的试制命令检查实际印面。随后在可编辑交付副本通过项目通用入口发布，保存的房间使用明确的 ID 和版本。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wayfinding-v1/examples/training-orientation-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wayfinding-v1/examples/training-orientation-v2.json
```

## 来源

四款版式、图标、配色与文案为 Company Studio 环境制作组原创。矢量轮廓在 artwork.json，项目署名与授权说明在 original/。render.py 按统一规则读取配方和矢量数据；build-wayfinding.mjs 调用既有 buildInformationResources 建立标准 UV 与材质。两种语言工具只读取随包源文件。

字形来自随包 Noto Sans SC 可变字体，附 SIL Open Font License 1.1。字体与许可位于 assets-source/company-information-v1/，路径及哈希写入每张资源卡。发行方的原始文件见 [Google Fonts 的 Noto Sans SC 目录](https://github.com/google/fonts/tree/main/ofl/notosanssc)。
