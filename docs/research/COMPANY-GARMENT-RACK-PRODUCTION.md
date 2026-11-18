# 开播准备间的开放衣架与陈列挂衣

[两份房间批次](../../scripts/company-platform/batch-inputs/garment-rack-rooms.json)共用一套衣架与挂衣资源。出租屋的开播准备间放落地全身镜，整租平层的造型间放化妆台和三折镜。每个挂位上的衣物有自己的实例 ID 和资源版本，布局和游戏存档可分别编辑这两件衣物。

## 制作与安装

每个开放衣架占用 1.00 × 0.50 米地面，高度上限 1.80 米。挂杆沿局部 X 轴，中心高度 1.50 米，半径 0.015 米。左、右挂位的局部 X 分别为 −0.24 和 +0.24 米，挂钩坐落在杆顶 1.515 米处。挂衣肩线沿 Z，局部转角为零，垂挂衣物的规格为 0.14 米宽、0.432 米深和 0.86 米高。设计时保留衣钩、衣撑和布面的独立几何。

衣架正前方为 +Z。架前宽 0.88 米、深 0.60 米的取衣位置须留空，转架时该范围随架一起转。每个挂位装一件挂衣，父架与挂位共同标识安装位置。该配置用于游戏环境中的静态陈列。带门衣柜另需门板运动和开门空间；角色穿戴沿角色平台的身体与服装规格。

新增挂衣时提交一项 `add-facility`，填写自身 ID、版本化资源、父衣架 ID 及 `attachment: {"slotId":"left"}` 或 `"right"`。省略变换会使用挂位的精确位置。用 `replace-resource` 可只替换架或单件衣物；`attach-garment` 用挂衣 ID、目标架的 `parentId` 和目标 `slotId` 在同一房间换位。复制整个衣架沿用 `copy-facility`。这套坐标约定沿用引擎的父子变换，授权原件与适配参数随本包提供。[Khronos 关于本地和世界变换的说明](https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_004_ScenesNodes.html)

## 给其他制作 agent

在独立可写的接收副本中安装 `source/prototype` 的锁定依赖，再从 `source` 目录运行下列命令。批次输出选新目录。试制配方的 `type` 表示衣架（`rack`）或陈列挂衣（`garment`），一份集合可同时提供两者。衣型可编辑实际裁片轮廓、衣褶和接缝，布纹可从有授权的 PNG 导入。架型可调整支撑形式和构造尺寸，交叉木脚款可从具名 GLB 网格适配脚件。每个新资源使用稳定 ID 和版本。[生产源与示例](../../assets-source/company-garment-rack-v1/README.md)

```powershell
node scripts/company-platform/build-garment-rack.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/garment-rack-rooms.json ../my-dressing-rooms
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-garment-rack-v1/examples/bell-sleeve-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-garment-rack-v1/examples/bell-sleeve-v2.json
```

回到正式包根目录运行 `node verify.mjs` 核对清单，运行 `node serve.mjs 0` 打印本机观看地址。将地址查询参数设为 `?delivery=wardrobe-rental` 或 `?delivery=wardrobe-floor`，点选造型间或开播准备间进入近看。在「添加」里先选「开放衣架」，再选「陈列挂衣」和一个空挂位。选中已有衣物后可从「调整位置与摆放」选择另一个空挂位。
