# 制服技术交接的资源、许可及兼容性

同项目游戏制作 Agent 的制服技术交接使用 `80fb16b7 / 5859bd00da8b` 和本目录新签的两条 1K 制服记录。历史近、远两组提供原色和上衣纹理对照。技术交接属于项目内制作和测试。整包公开再发布尚无完整的来源条件复核，且包内存在已明确保留内部试验范围的动作派生文件。[本批签名记录](records.json) · [本批清单](inventory.json) · [历史近远包](../m2-garment-texture-game-v1/receiver/README.md)

## 实际模型和衣物

已从 VRM/GLB 字节复算 SHA-256，核对装备清单中的身体指纹和 GLB 自带的来源。下表用摘要前缀定位，完整摘要保留在链接中的清单和两份 inventory。

| 资源 | 男制服 | 女制服 |
| --- | --- | --- |
| 实用身体 | `source-male-ab9a-release-v1`，`cf1118a2…`。从第三方旧 β `Base_Male.vrm` `ab9af434…` 去除四个已独立装配的制服图元，保留源身体。 | `female`，`027bed60…`。从第三方旧 β `Base_Female.vrm` `1995f174…` 保存 Blender 可编辑重建后再导出的完整身体。 |
| 原上衣和领结 | `source-outfit-release-uniform-top-v1`，`10a51cbd…`，抽自原男制服。 | `m1-uniform-top`，`27bcfe02…`，抽自同一女体原上衣及领结图元。 |
| 裤 | `source-outfit-release-uniform-pants-v1`，`849d1b87…`，抽自原男制服长裤。 | `m1-training-pants`，`9e41d6df…`，项目从完整女体拓扑裁片制作的及膝练习裤。GLB 使用材质色值，无嵌入图片。 |
| 鞋 | `source-outfit-release-flat-shoes-v1`，`9c69190f…`，抽自原男平底鞋。 | `m1-uniform-shoes`，`c4e4178a…`，抽自原女鞋。 |
| 远端上衣 | `raw-male-uniform-top-1k-v1`，`eef03164…`。派生自上表男上衣，重新登记到 `cf1118a2…`。 | `m1-female-uniform-top-1k-v1`，`030a5814…`。派生自上表女上衣，登记到 `027bed60…`，携带自己精确绑定的 Body 遮罩。 |

两件 1K 只把各自原 2048² 不透明底色图在线性光空间缩至 1024²，保留原 256² 领结图、几何和蒙皮，沿用原装备来源字段。裤鞋在近远组内分别共用原字节和身份。[男身体配方](../m2-source-outfit-release-v1/body/recipe.json) · [男装备](../../prototype/public/assets/source-outfit-release-v1/equipment.json) · [女装备制作](../../assets-source/m1/README.md) · [女装备](../../prototype/public/assets/m1/equipment.json) · [1K 适配回执](../m2-garment-basecolor-release-v1/runtime-fits.json)

### 使用条件

- 两个原模型和两个运行身体的 VRM0 元数据均声明 CC0、Everyone、商用允许。嵌入链接还列出允许修改、再分发及无需署名。发布者 hecko 的本地归档记载旧 β 0.14.0 无优化导出，并归属 VRoid Project；当前访问发布页返回 403，本次用保存的发布页、原件与哈希复核。pixiv 的旧 New model 专页声明所列旧模型为 CC0。CC0 覆盖权利人可放弃或许可的版权及相关权利，含改作、商用和再分发。现有文件是第三方导出，缺少与 pixiv 原始 β 导出的逐字节核对。项目的女裤新制作和 1K 派生沿留其来源记录，整个技术包的权利状态还取决于其他实际随附资源。 [男源许可档](../../assets-source/foundation-male/LICENSE.md) · [女源记录](../../assets-source/foundation/source.json) · [旧模型官方条款](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model) · [CC0 正文](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)
- 当前 Studio 通用条款对现行预设和生成或输出变形、组合模型的应用另有条件。本包的旧源依据仅适用于这里列明的来源、身体与装备。两套实际 inventory 均另含 `frozen-rokoko-30s-v1` 两个女体动作 JSON。该来源记录为 Pexels / Sergey Makashin / 5359146 和单次 Rokoko 试验，保留项目内部试验范围，尚无正式商业资产清权回执。公开整包前需按实际随附清单解决动作用途，若调整依赖需重新构建和收证。 [Studio 现行条款](https://vroid.com/en/studio/guidelines) · [冻结动作来源边界](../../prototype/public/assets/motion/m1c/frozen-rokoko-30s-v1/README.md) · [近包 inventory](../m2-garment-texture-game-v1/receiver/near-inventory.json) · [远包 inventory](../m2-garment-texture-game-v1/receiver/far-inventory.json)

## 本批新签外观依赖

`uniform-1k-female` 与 `uniform-1k-male` 均为 revision 1，选用 `pants-top-far`，女 index 5、男 index 1。女记录使用 `female-bob-v1`、金发 `blonde`、暖肤 `warm`、棕瞳 `brown`、珊瑚唇 `coral`，男记录保持原发与原色。已把本批实包的 47 项 inventory 逐项重算字节和 SHA，并核两个实际记录对象均等于本目录原签记录。计入 `runtime-package.json` 共 48 个文件。相较历史 1K 制服包，实际新增以下六项资源，共 736,193 B。记录 URL 改为本批两个新 ID，记录入口清单随之更新。[本批清单](inventory.json) · [新记录消费回执](game/report.json)

| 新包路径 | 字节 | SHA-256 前缀 |
| --- | ---: | --- |
| `assets/m2-hairstyle-v1/female-bob.glb` | 651,604 | `3dcf0195…` |
| `assets/m2-hairstyle-v1/manifest.json` | 519 | `98bc1b08…` |
| `assets/appearance-color-v3/runtime-manifest.json` | 9,116 | `2eff13c1…` |
| `assets/appearance-color-v3/female-iris-mask.png` | 4,051 | `d6178bb0…` |
| `assets/appearance-color-v3/female-iris-neutral.png` | 69,621 | `3cbc5234…` |
| `assets/appearance-color-v3/female-outer-lip-mask.png` | 1,282 | `b7f1de38…` |

短发由项目从本批同一旧 β 女体的后发图元延长侧后轮廓得到，挂在原始头骨局部，清单只登记 `027bed60…` 女体。GLB 无蒙皮，内嵌的发色图、法线图与黑色着色器图三份字节均在该女体原文件中找到相同 SHA。金发由固定运行时对现有材质和贴图着色，暖肤由身体及脸部材质乘色，二者没有新增发色或肤色 PNG。棕瞳使用 v3 中性虹膜底图及 v2 沿用的虹膜遮罩，珊瑚唇使用沿用 v1 的外唇遮罩。已直接提取原女体虹膜和脸部贴图并核对 v3 清单的源图 SHA。外唇范围是女体脸部 UV 上定义的局部遮罩。 [短发制作与适配](../../assets-source/m2-hairstyle-v1/README.md) · [短发来源记录](../../assets-source/m2-hairstyle-v1/provenance.json) · [v3 派生说明](../../assets-source/appearance-color-v3/README.md) · [原外唇遮罩](../../assets-source/appearance-color-v1/README.md)

短发沿旧女体的来源与使用条件。调色文件以相同源材质、贴图和 UV 为依据由项目派生，作者档明确未单独标为 CC0。本次未找到这些新增派生文件的独立公开许可声明，也未核实其他体型适配或新增公开用途。历史包中的两份 Pexels/Rokoko 动作仍随本批包交付，SHA 不变，沿上面的内部试验范围。此段只复核新签外观资源，历史签名在 `5859` 的浏览器复验另行记录。

## 已见收件方和兼容建议

核查收件历史时使用的交付单是操作器 `2ae88304`、游戏源码 `cfca0dd1`、构建 `fe2e58489bbb`。有实证的收件路径为融合工程 `formal-round/actor` 及其 `actor-operator-update` 复算，以及 `native-studio-round/registration` 从同一固定交付单启动的登记；其后登记候选有自己的新构建。融合的 `formal-round/authoring` 和 `mira-source-independent` 明确记录用于旧构建的新身体拒绝。以上是已核路径。 [原交付单](../../delivery/history/character-production-handoff-2ae88304.json) · [独立收件回执](/F:/gamemake-test/formal-round/actor-operator-update/evidence/summary.json) · [Studio 登记](/F:/gamemake-test/native-studio-round/registration/README.md) · [新身体拒绝](/F:/gamemake-test/formal-round/authoring/README.md)

本次对精确检出和 dist 做只读 inventory 试算。旧 `fe2e58489bbb` 拒绝新男近记录，原因是未知身体；拒绝新女远记录，原因是服装版型不兼容。新 `5859bd00da8b` 分别接受新近、远双记录，各 41 项 inventory；原总交付单两条短袜签名记录在新构建也通过资源解析，得 37 项。随后在新构建的独立包运行旧签名，两人首次进入和关闭重开均还原，详见[浏览器回执](previous-game/report.json)。旧操作器提交的评审索引没有 `5859bd00da8b`，当前索引已有该版本与旧版的独立条目。 [原记录复算回执](../character-worktree-relocation-v1/operator-receiver.json) · [当前评审索引](../../scripts/runtime-package/game-runtime-reviews.json)

当前内部交付采用制作工具 `e8dc4eb2` 与游戏构建 `5859bd00da8b`。旧版短袜交付已归档。历史融合收件方尚未提供针对本次制服包的回执。两具身体的纹理预算仍超限。[现用交付单](../../delivery/character-production-handoff.json) · [本机接收回执](verified-handoff.json)
