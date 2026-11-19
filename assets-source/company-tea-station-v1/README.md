# 茶水区柜体和器具制作

四款柜体共用 1.20 × 0.90 × 0.60 米的落地尺寸，坐标为底部居中、+Y 向上、+Z 朝正面。饮水服务柜保留冷藏箱门，旁边有实心滤芯侧柜和通风条。茶具台使用两组真实柜门和抽屉。咖啡台左边是吧台模块，右边开放。边台采用四条窄腿和双面开放搁架。门、抽屉和这些架下隔板均是固定造型。

台面 `counter` 由唯一的 `countertop` 网格承载，台面高度为 0.90 米。它的可用尺寸为 1.20 × 0.60 米，净高 0.65 米。咖啡机和杯各自可挂在承载面。咖啡机居中时，杯可放到台面局部位置 `[-0.31, 0.90, 0.13]`。咖啡机自带杯托，`attachment.surfaceId: "tray"` 可将杯居中放回，托盘的两个上表面三角来自原机。杯与机分开导出，因此移动杯只改变该实例的承载关系。设备的 `on` 状态驱动实体前面的 `tea-machine-indicator`。杯托正上方留有 0.09 米净高。

## 原件与许可

柜体借用了 Furniture Kit 2.0 中的五个家具原件。咖啡机和杯使用同一 GLB 的不同部件，保留原始三角，将器具换算到米制，并为机器加装一颗独立指示灯，为杯设置陶瓷釉色。随 GLB 提供实际原档、原 ZIP 成员名和 SHA-256。ZIP 沿用项目已有版本，内部许可原字节保存在 `original/Kenney-Furniture-Kit-License.txt`，各源路径及作者记录在 `original/sources.json`。原作者规则是 CC0 1.0。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)

## 重导与新款

在安装包内锁定依赖的可写工作副本的源码目录运行：

```powershell
node scripts/company-platform/build-tea-station.mjs --check
node scripts/company-platform/build-tea-station.mjs --output output/my-tea-models --parameters assets-source/company-tea-station-v1/examples/open-wide-shelf-v2.json
```

`parameters.json` 声明默认六项。柜体的 `topThickness`、`palette`、`modules` 和 `panels` 都可改。家具模块以目标宽高深、X/Z 中心和底高拟合，柜板以目标宽高深和三轴中心定义。示例把开放边台的上层搁板抬高并加厚、加深，再加一个接地侧撑。挂装尺寸和承载合同随 `contract.json` 保持固定。咖啡机与杯沿用有真实托盘和杯部件的源，杯可改 `glaze`。如使用获许可的柜部件，引用其实际 GLB、作者、许可文本、对应 SHA-256，给它一个独立的 `sources` 键。

`--root` 指定项目根，`--source` 指定项目内源家族目录，`--asset-root` 指定包含 `tea-station-v1` 的运行资源根目录。使用 `--output` 时，运行资源默认输出到该目录内的项目相对路径，`--asset-root` 若指定也须位于该输出目录。默认制作可用 `--write`。已存在的发布文件逐字节比对，不覆盖同版本异字节结果。

离线检查每件均重新生成两次，读取实际 GLB 并复核网格包络、非零面积落座、矩形支承及其上方净空。台面和托盘各采九个首个命中点，机器指示灯另由正面射线确认。选择 `--output` 会把几何报告写入 `report.json`。
