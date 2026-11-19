# 来宾签到、培训报到与楼层导视

两套布局复用现有牌框、登记台、笔和本。整层大厅提供双人等候座，大楼二层设寄衣架。每层各有一块接待牌、一块电梯牌和一块楼梯牌。三个入口分别绑定真实门口和目的区域。交付包运行 `node serve.mjs` 后，可在其地址后加下列参数。

| 房间 | 观看入口 |
| --- | --- |
| 整层来宾签到 | `?delivery=public-wayfinding-arrivals&region=public-wayfinding-arrivals/ground/lobby` |
| 大楼二层培训报到 | `?delivery=public-wayfinding-training&region=public-wayfinding-training/upper/corridor-1` |

房间总览可查看柜台、座位或衣架的位置。查看文字时，在物品面板选中牌面并点聚焦。牌框和印面各有独立的实例，印面的外观列表按版本显示。隐藏内容、换框、换同用途图文后可保存并关闭重开。

### 给制作 agent 的输入

双房输入在 `scripts/company-platform/batch-inputs/public-wayfinding.json`。每条 `wayfindingRooms` 声明一个楼层，`signs` 中的项目绑定目的区域、来源区域、实际门口、牌框和印面实例。指定的 `meaning` 取 arrivals、training、lift 或 stairs。改变标题或图标时保留相应用途。服务区的 `stand` 是所在区域内的平面米坐标，`registerParts` 指向登记本及笔的真实网格。调整摆位后，从既有门口检查到柜台、座位或衣架的通路。

在接收副本的 `source/prototype` 安装锁定依赖（`npm ci`），从 `source` 运行下列命令。最后一项在新的工程内测试目录运行，会同时测试无效输入和失败保旧。

```sh
node scripts/company-platform/build-wayfinding.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/public-wayfinding.json output/reception-batch
node scripts/company-platform/test-wayfinding.mjs output/reception-test
```

四款印面共用 0.88 × 0.56 米的安装面。文字与图标由可编辑配方生产为 1100 × 700 纹理，随 GLB 交付。修改培训牌可参考 `assets-source/company-wayfinding-v1/examples/training-orientation-v2.json`。在接收方工作副本运行下列命令后，选择原培训牌实例，按完整资源身份 `wayfinding-training@2` 更换为“新人报到”。旧版保留原身份。

```sh
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wayfinding-v1/examples/training-orientation-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wayfinding-v1/examples/training-orientation-v2.json
```

入口视线以 1.50 米静态眼位和实际印面朝向检查。背向入口会报告 `wayfinding-sign-facing`，前方被物件遮挡会报告 `wayfinding-print-blocked`，将楼梯牌装到登记牌的位置会报告 `wayfinding-content-meaning`。报错包含受影响的实例。这里交付空间布置与导视素材。角色办理签到、跨层移动和经营结算由对应游戏系统处理。
