# 公共洗手区

两份独立公司分别在整层西墙、大楼二层南墙布置了洗手区。可替换的部件包括落地盆台、挂墙镜、壁挂皂液器和入口导视牌。导视图文是牌面上的独立子件，可以跟着牌子移动。

## 观看

在收到的包根运行 `node serve.mjs`。沿程序打印的本机地址，用下表中的查询参数打开实际楼层及洗手区。选择盆台或皂液器可换款，房间全景可用鼠标拖转。在工作副本中保存后，用同一浏览器重新打开服务首页即可查看刚保存的版本。

| 布局 | URL 查询参数 |
| --- | --- |
| 独立楼层西壁 | `?delivery=public-washroom-floor&region=public-washroom-floor/ground/restroom-access` |
| 大楼二层南壁 | `?delivery=public-washroom-building&region=public-washroom-building/upper/restroom-access` |

## 生产

先在原包执行 `node verify.mjs` 校验清单，再在工作副本的 `source/prototype` 运行 `npm ci`。以下命令从副本的 `source` 执行。

```sh
node scripts/company-platform/build-public-washbasins.mjs --check
node scripts/company-platform/build-washroom-dispensers.mjs --check
node scripts/company-platform/build-washroom-sign.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/public-washrooms.json output/washrooms
```

原始盆体和龙头复用 Kenney 的 CC0 模型。泵式皂液器复用 MiniPoly 的 CC0 瓶体和贴图，另外三款各有独立的壳体和按压件。两个家族的 `original/` 目录含原件、版权依据、下载来源和哈希。入口图文使用项目内的 Noto Sans SC 字体和既有图文板格式，重绘依赖 Pillow 12.1.0。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) · [MiniPoly Hand Wash Bottle](https://poly.pizza/m/d4b5btUs1F)

以下两份输入共用正式发布入口。第一份将台板厚度从 32 毫米改为 40 毫米并使用版本 2，第二份以独立身份发布加宽箍壳。在同一工作副本重跑 `--check` 可核对已登记结果。

```sh
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-public-washbasin-v1/examples/frame-thick-v2.json
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-washroom-dispenser-v1/examples/wide-clad.json
```

台盆底部中心为原点，+Z 朝向使用者，四款实物均为 1.20 × 0.90 × 0.60 米。皂液器以墙上背板中心为原点，安装包络为 0.15 × 0.25 × 0.14 米。公共卫生区的 `publicWashrooms[]` 记录区域、与相邻公共区相连的门口、盆台、镜子、皂液器、导视牌的实例 ID 和区域内的站位 `[x,z]`。制作其他布局时保留这些明确的归属，再随新墙面调整朝向和站位。普通房间可单独使用洗手台。

从工作副本根目录用 `node edit.mjs apply 原房save.json 操作.json 新结果目录` 替换设施，随后运行 `node edit.mjs validate 新结果目录/save.json`。例如西墙盆台使用 `replace-resource`，目标 ID 为 `public-washroom-floor/ground/restroom-access/washbasin`，资源为 `{"id":"public-washbasin-frame-round","version":2}`。

校验会从大厅沿相连公共区找到门口和站位，测量真实台板与凹盆、龙头下方的盆腔、镜面朝向、按压件可达距离、出口下方净空以及清洁空间。皂液器仍贴墙但离站位过远时会返回 `washroom-dispenser-reach`。保留上一次有效存档，修正失败的设施后重试。此包交付的是空间、设施和实物可达性数据。用水、卫生经营结算和人物动作另由相应的游戏系统承接。
