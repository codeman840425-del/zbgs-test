# 公共储物清洁间的制作与观看

房间属于楼层公共区域。两份输入各保留 16 间经营房，将耗材架、清洁柜和备品推车放在实际连通的侧室内。打开交付包的 `node serve.mjs`，在输出的地址后追加所需的查询参数。

| 空间 | 面积与入口 | 查询参数 |
| --- | --- | --- |
| 整层公共储物间 | 4.5 × 4 米，从大厅进入 | `?delivery=public-storage-floor&region=public-storage-floor/ground/stock` |
| 大楼二层储物间 | 4 × 4.5 米，经同层公共区域进入 | `?delivery=public-storage-building&region=public-storage-building/upper/stock` |

`publicStorageRooms` 数组的每个条目用场景实例 ID 指定区域、门口、层架、铰链柜和推车，`picks` 内每件耗材绑定自己的 `hostId`、`surfaceId` 和 `loadId`。柜前站位 `cabinetService` 使用区域内的 `[x,z]` 米坐标。更改家具朝向或位置后，用校验入口重新检查开柜、前取和从公共入口到三个操作位置的通路。

四款层板货物为分隔提篮、开口纸箱、封口纸箱和布巾周转盘。安装包络上限为宽 0.38 米、高 0.30 米、深 0.23 米；原点在底面中心。货物可以作为独立子件放在层架或推车指定的板面上。父件转向时，子件保持相对位置。柜门的实际扫掠空间单独验证，柜体内部的收纳和清洁任务由后续能力承接。

两种纸箱复用 Kenney Furniture Kit 2.0 的 CC0 原件。提篮和布巾盘使用项目可编辑参数制作。原始模型、许可、尺寸和来源哈希在 `assets-source/company-cleaning-loads-v1/original/`。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)

在原包运行 `node verify.mjs`。另取工作副本，在其 `source/prototype` 运行 `npm ci` 后，从 `source` 执行以下命令。

```sh
node scripts/company-platform/build-cleaning-loads.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/public-storage-cleaning.json output/storage-batch
node scripts/company-platform/test-public-storage.mjs output/storage-check
```

同一提篮的第二份输入将把手顶端由 27 厘米提高到 29.5 厘米，以版本 2 登记。在可写副本的 `source` 运行下列命令，然后对实际房间的篮子实例执行 `replace-resource`，选用 `cleaning-load-caddy@2`。

```sh
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-cleaning-loads-v1/examples/caddy-tall-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-cleaning-loads-v1/examples/caddy-tall-v2.json
```

架面朝墙可触发 `storage-pick-blocked`，托板下沉可触发 `storage-support-contact`，柜门扫到挡件可触发 `storage-door-sweep`。按错误中指出的设施和板面修正，再对原有效布局重试。这里的通路和取货测量使用设施实物与净空，真实人物伸手取货和清洁经营仍需游戏系统接入。
