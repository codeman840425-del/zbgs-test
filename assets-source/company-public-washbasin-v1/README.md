# 公共洗手台

四款落地盆台用于公共卫生服务区。底部中心为原点，+Y 向上，+Z 朝使用者；四款的实物外包络均为宽 1.20、高 0.90、深 0.60 米。可移动、旋转、保存的单位是整台设施。柜面、搁架和龙头为静态部件。

| 资源 ID | 源盆 | 台面与支撑 |
| --- | --- | --- |
| public-washbasin-frame-round | 圆盆 | 小倒角台板、四根圆钢管、上框与低位系杆 |
| public-washbasin-cabinet-square | 方盆 | 直边台板、落地柜体、竖条面板与内退踢脚 |
| public-washbasin-pier-round | 圆盆 | 大切角台板、两侧石墩、陶瓷后侧横向连接件 |
| public-washbasin-shelf-square | 方盆 | 切角台板、单侧窄柜、独立搁板支撑与两层开放架 |

## 来源及适配

Kenney 的 Furniture Kit 2.0 以 CC0 发布。沿用项目已保存原包，逐字节提取两件 GLB 及许可。源包 SHA-256 为 `e67652d0932cee41683f74711c03d3e192a2af9979ef8e6b237711f5482d46b0`。源记录列有各成员路径、完整哈希与字节数。[原作者页面](https://kenney.nl/assets/furniture-kit) · [源记录](original/sources.json) · [原许可](original/License.txt)

两种盆原件均含陶瓷盆腔、立柱和金属龙头。以父节点单位变换读取 glTF，圆盆源外包络约 0.34 × 0.56 × 0.29 米，方盆约 0.43 × 0.58 × 0.30 米。按原索引分离可见材质区，原顶点、三角拓扑、UV、法线与饰面经同一 1.4 倍均匀尺度及平移适配。圆盆源含 316 个三角形，方盆含 234 个。槽口、管件与原盆正面保留；新制部分包括镂空台板、支撑与接地座。工作面顶高 0.788 米，龙头最高 0.900 米。台板切口由实际陶瓷在台面高处的外轮廓生成，向内保留约 1 毫米承接边。

## 离线制作

使用接收源码中的 `prototype/package-lock.json` 安装依赖。从源码根目录运行制作命令。试制目录须为新目录。

```powershell
node scripts/company-platform/build-public-washbasins.mjs --check
node scripts/company-platform/build-public-washbasins.mjs --write
node scripts/company-platform/build-public-washbasins.mjs --output output/public-washroom-v1/rebuild
node scripts/company-platform/build-public-washbasins.mjs --parameters assets-source/company-public-washbasin-v1/examples/frame-thick-v2.json --output output/public-washroom-v1/frame-v2
```

[配方](parameters.json) 指定支撑类别、材料颜色、台板厚度与版本。厚度范围为 24–44 毫米，上表面标高固定，板底和支撑顶随厚度联动。[第二输入](examples/frame-thick-v2.json) 将圆盆钢架台板从 32 改为 40 毫米，并以版本 2 输出。已登记的同一 ID 与版本不能接受改过的配方。

## 实体回读

[合同](contract.json) 固定用途、安装、占地和部件命名。`basin-bowl` 为陶瓷、`basin-faucet` 为龙头、`wash-countertop` 是贯通切口的台板、`pedestal-foot` 为接地座。[生产清单](collection.json) 保留每款的输出和依赖身份、几何摘要以及以下 GLB 回读结果。

- 每款九条垂直射线穿过盆口，首击原盆实体。龙头出水端下方的首击在圆盆高 0.704 米、方盆约 0.718 米。模拟封住开口的实心板会使同一检查失败。
- 从正面局部 `[0, 1.38, 0.64]` 可直接看到盆内。左右翼板在安装高度各有实际朝上的台面。台面中间留给盆腔，设施卡不把整块矩形登记为可自由摆物的承载面。
- 各框架主要支撑的脚点命中地面，顶部接触台板下表面。原盆立柱连到接地座，盆缘接到台板、龙头接到陶瓷。接触遍历覆盖每个可绘制部件。陶瓷与柜架分别检查，横撑位于其背侧。
- 房间入口可达、壁镜与分配器归属、版本恢复及游戏内画面由洗手区联合验收回执记录。本制作产物不模拟水流或人物动作。
