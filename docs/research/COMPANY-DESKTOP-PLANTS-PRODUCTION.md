# 在直播工位上布置盆栽

民房的盆景放在横梁桌后侧，与桌上的竖屏手机错开。整套出租屋的阔叶盆栽放在侧柜书桌的另一侧，旁边是横屏手机。这两张桌保留显示器、键盘、麦克风和可用座位。批次输入在 [desktop-plant-rooms.json](../../scripts/company-platform/batch-inputs/desktop-plant-rooms.json)。

## 给制作 agent 的安装约定

选择 `plant-desktop-installation` 外观，设施的父级填直播桌实例。桌面使用既有 `desk-surface` 安装方式，局部 +Y 向上，花盆底中心为原点。每款预留 0.35 米宽、0.35 米深和 0.55 米高的空间。预留范围内可以有不同尺寸和轮廓的植株。把盆底放在父桌声明的 `surface.topY`，示例桌面高 0.84 米。可用朝向为四分之一圈的整数倍。

检查整块安装范围与桌沿、邻近设备和线缆的关系。移动或复制工位时，盆栽随桌移动。单件换款保留实例身份、父桌和局部位姿。游戏消费普通设施和完整公司存档。盆栽属于静态装饰，角色通行与坐姿沿用工位原有数据。

素材生产从已有花盆网格和授权原件开始。层冠盆景、分叉仙人掌、阔叶和多肉分别有自己的枝叶轮廓。原包的花盆和叶片可以按节点导入。资源说明、配方和精确来源指纹随包交付。[素材说明](../../assets-source/company-desktop-plants-v1/README.md) · [Kenney Furniture Kit 官方素材及 CC0 许可](https://kenney.nl/assets/furniture-kit)

## 在接收副本中使用

包根目录运行 `node verify.mjs` 可核对发布清单。复制为可写工作目录，运行 `npm ci --prefix source/prototype` 安装锁定依赖。在 `source` 目录运行以下命令，批次输出使用新的目录名。

```powershell
node scripts/company-platform/build-desktop-plants-v2.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/desktop-plant-rooms.json ../my-plant-rooms
```

导入下一株时，在 `assets-source/company-*` 下放入可编辑配方、GLB 和授权文件，填写真实作者、文件 SHA256、盆和叶的网格名及最终尺寸。以下命令使用随包的尖叶盆栽示例。换成自己的配方可走同一发布入口。已发布的资源 ID 和版本继续指向原来的模型字节。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-desktop-plants-v1/examples/pointed-kenney-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-desktop-plants-v1/examples/pointed-kenney-v2.json
```

在布局的 `add-facility` 或 `replace-resource` 操作中选择新资源并重新运行批次。正式包从根目录运行 `node serve.mjs 0` 后，在打印的地址后加 `?delivery=plant-home` 或 `?delivery=plant-rental` 即可观看两张工位。

## 交付可编辑原稿

在配方的 `sources` 中为相应来源添加 `editable`，例如：

```json
"editable": {
  "path": "assets-source/company-my-plant/author.py",
  "sha256": "<原稿实际字节的64位小写SHA-256>"
}
```

原稿需为 `assets-source/company-*/` 内的普通文件。可用 `(Get-FileHash -Algorithm SHA256 原稿路径).Hash.ToLowerInvariant()` 取得摘要。工具读取原稿以校验和随包保存；原稿的执行和 GLB 导出由制作方完成。GLB 与许可仍须各自声明文件和摘要。

从接收包的 `source` 目录试导，再按同一配方发布。

```powershell
node scripts/company-platform/build-desktop-plants-v2.mjs --parameters assets-source/company-my-plant/recipe.json --output ../trial-new
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-my-plant/recipe.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-my-plant/recipe.json
node scripts/company-platform/build-library.mjs --check
```

显式原稿登记在 `provenance.dependencies.editableSource`。修改已登记的原稿会导致建库检查失败。制作下一版时保留旧原稿，为新稿使用独立路径、摘要和资源版本。冻结的 `build-desktop-plants.mjs` 提供 V1 几何编译和历史复建；新增原稿请走上述 V2 入口。V2 对没有声明原稿的历史配方保留原侧车、模型和集合字节。
