# 落地移动吸声屏

本族用于直播间和公共区的静态布置。每件可独立平移、转向与复制。四款使用落地底心原点，Y 向上，Z 向前。整机实际宽 1.20 米、高 1.80 米、含脚深 0.38 米，脚占地参与阻挡。字典中待核的 0.12 米可对应直板边轨；整机需要按实际底脚深度留出通道。吸声词表示设施用途。配方没有声学性能测值，折屏和脚轮以定姿保存。

| 资源 @1 | 可编辑构造 | 可辨实体 |
|---|---|---|
| absorber-folding | 3–5 叶、相邻叶方向交替、单叶倾角 9–23° | 每叶单独硬芯、前后布饰；每条折缝有三只接触叶片的立轴，两只钢底脚接地 |
| absorber-casters | 每侧 2–6 块横向布饰及色板 | 四处实轮各含胎、双轮毂、叉片、桥和转向轴承；两条钢托梁接屏体 |
| absorber-double-sided | 底脚中心距 0.62–0.92 米 | 复用原分隔屏真实错列毡块、双面和边轨；保留原展示板实脚尺寸，两只脚托住下轨 |
| absorber-curved | 弦高 0.10–0.21 米、每面 5–15 条曲面布饰 | 弯曲的封闭芯和两面曲面布饰；两只钢底脚承托曲面底边 |

## 复产与改款

在交付源码根目录先按项目说明从 prototype/package-lock.json 安装依赖。默认材料、配方和原件均可在本地读取。标准参数为 parameters.json。用以下命令核对已登记四款，或导出到新的工程内试制目录。

```powershell
node scripts/company-platform/build-movable-absorber.mjs --check
node scripts/company-platform/build-movable-absorber.mjs --output output/movable-absorber-trial
node scripts/company-platform/build-movable-absorber.mjs --parameters assets-source/company-movable-absorber-v1/examples/folding-four-leaf-v2.json --output output/movable-absorber-v2-trial
```

从清洁源码树创建基础文件用同一脚本的 `--write`。CLI 校验每个已存在的目标签名，试制需指定新目录。示例将相同 ID 的三片十四度折屏改为四片十八度，形成三道折缝和九处轴件。接收方可复制 JSON，选择结构，按上表改参数，更新版本或分派新 ID，再导出。每份项目相对输入会随来源 SHA 写入侧卡。正式独立发布的通路是项目的 `publish-room-appearance.mjs --publish / --check` 加该输入文件。

给制作 agent 的示例指令为「保留两只实脚和已登记占地，用四折案例做新版固定展开布屏，保留每叶的前后布饰并改折角。登记新版本，检查地面与过道，再在直播房里比较实物两个方向。」

## 在独立包中使用

在包根启动 `node serve.mjs`，打开它打印的本机地址。将查询参数改为 `?delivery=absorber-studio` 看独立唱播间，改为 `?delivery=absorber-rental` 看带货出租屋。去掉查询参数、重新打开同一地址可以恢复自己保存的布置。在物品面板选中落地屏，可以切换四款、转向、移动并保存。屏前后两面都可观看，挡住真实房门时原有位置会保留。

将已核对清单的交付包复制为可编辑副本，在其中的 `source/prototype` 运行 `npm ci`。回到 `source` 后运行以下命令。试制目标须为新目录。

```sh
node scripts/company-platform/test-movable-absorber-rooms.mjs output/absorber-room-check
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-movable-absorber-v1/examples/folding-four-leaf-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-movable-absorber-v1/examples/folding-four-leaf-v2.json
```

然后在 `source/prototype` 运行 `node scripts/build-company-id.mjs` 及 `npx vite build --config vite.company.config.js`。从新构建打开旧房间存档，在编辑器中选择新版折屏并显式保存。原三折 `@1` 和新四折 `@2` 有各自的资源版本。项目内接收副本可把显式输出指向所在的 `company-workspace/production-trials/<工作包>/` 下。独立部署按包根 README 的命令打包新查看器、存档和完整依赖。

## 原件与使用条件

全部签名见 original/sources.json。包内原件保存于同级 original/，无须联网获取。

- screen-partition-acoustic.glb 源自项目 screen-partition-acoustic@1。双面款保留框、背板、12 组双侧凸毡块及原材质。原可编辑输入为 assets-source/company-screen-partition-v1/parameters.json。
- floor-whiteboard.glb 源自项目 information-board-floor-whiteboard@1；复用其中 information-base 的 0.24 × 0.06 × 0.38 米实体制成双脚。源配方为 assets-source/company-floor-information-v1/parameters.json。原工具和模型许可见 original/PROJECT-SOURCE.txt。
- platform-utility-cart.glb 由 Innerscene Corp 以 CC0 发布。取出真实胎、轮毂、轴承、叉片，以自制叉桥、销轴和托梁连接，配项目材质。随包保存完整原 GLB 与 original/CC0-source-declaration.txt。[Innerscene 原件页](https://www.innerscene.com/tools/library/3d-parts/roll-platform-platform-cart-8c87f71c)
- 布板支撑参考 GIK 的成对钢脚。Kinnarps Vibe 展示固定与带轮金属脚的结构选择。两者仅作为结构参考，交付几何和材质来自上述签名源和本项目。[GIK Freestand Feet](https://www.gikacoustics.com/products/freestand-feet) · [Kinnarps Vibe](https://www.kinnarps.com/mediacdn/79ff6f4f-b68a-4716-a33a-53abc54cbd74/9998bc28-ff80-508e-bdb4-175d14810a29/Vibe_-_Product_brochure_EN.pdf)
