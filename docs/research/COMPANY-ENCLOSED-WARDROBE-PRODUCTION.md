# 双门更衣柜

整套出租屋和平层的造型间共用同一套柜体规格。衣架包已有的四款挂衣仍可装在柜内的左、右挂位。两扇门各自有开度，换柜体外观时保留挂衣实例、挂位、门状态和整柜朝向。[两房输入](../../scripts/company-platform/batch-inputs/enclosed-wardrobe-rooms.json)

## 给素材制作者

柜体占地 1.00 × 0.58 米，高 1.80 米，原点在底面中心，+Z 朝向室内。内杆沿 X 轴，杆心高 1.50 米，两个挂位在 X = ±0.24 米处。前方宽 0.88 米、深 0.60 米的取衣位置需要留空。两门的竖直枢轴位于 X = ±0.469 米、Z = 0.260 米处，门板和各自的五金随所属枢轴转动。[安装合同](../../assets-source/company-enclosed-wardrobe-v1/contract.json)

四款样件复用了 Kenney Furniture Kit 的书柜、厨柜、浴柜和入口门部件。源模型的实木、嵌板、拉手和玻璃分别适配到衣柜规格，玻璃款保留源材质的透光性。制作其他外观可以显式指定左右原门，也可以提供一扇门并声明镜像。配方记录原件、实际网格名称、许可和文件哈希。发布可编辑原稿时，提供相对源路径和 SHA-256。源资源使用 CC0，交付包包含许可原文。[作者素材页](https://kenney.nl/assets/furniture-kit) · [glTF 节点与父子变换](https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_004_ScenesNodes.html) · [四款参数](../../assets-source/company-enclosed-wardrobe-v1/parameters.json)

## 在房间中使用

新增设施使用种类 `enclosed-wardrobe` 的版本化资源和房间 ID。旧挂衣沿用 `attachment.slotId` 的 `left` 或 `right`。游戏存档保存每件挂衣自己的身份。房间批次的初始状态可以同时提供两扇门的开度。要单独开关一扇门，使用 `set-state` 修改 `leftOpen` 或 `rightOpen`，值从 0 到 1 对应关闭至 90° 全开。

柜门移动期间按各自的扫过区域检查阻挡物。左边有屏风时，右边仍可使用。关闭重开时按存储姿态恢复。角色取衣、换装动作和身体适配由角色平台另行接入。

在独立可写副本的 `source` 目录运行以下命令。将批次目录换成新的输出位置。要给既有房间添加同规格的新柜面，将制作者的配方传给 `publish-room-appearance.mjs --publish`，再用 `--check` 核对。

```powershell
npm ci --prefix prototype
node scripts/company-platform/build-enclosed-wardrobe.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/enclosed-wardrobe-rooms.json ../my-closets
```
