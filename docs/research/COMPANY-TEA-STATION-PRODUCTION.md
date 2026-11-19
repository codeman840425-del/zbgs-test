# 公共茶水站制作与移交

一套茶水站由落地柜、咖啡机和杯子三个设施实例组成。杯子通常放在机器托盘上，也可以单独移到台面。四款柜体共用 1.20 × 0.90 × 0.60 米的安装尺寸。改款可更换柜门、抽屉、隔板和支撑结构，同时保留实例、设备位置及机器开关。

## 制作和检查

在项目根目录运行以下命令。双房验证接受一个新的输出子目录，结果位于该目录的 `published/tea-rental` 和 `published/tea-floor`。

```powershell
node scripts/company-platform/build-tea-station.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-tea-station-rooms.mjs output/tea-room-check
```

房间输入见 [双房配方](../../scripts/company-platform/batch-inputs/tea-station-rooms.json)。出租屋使用公共客厅，整层使用十六间经营房之间的公共走廊。每个完整组合在 `teaStations` 中登记本房区域、入口、柜体／机器／杯子的实例 ID 和台前服务位置。整层另附清洁时须保持畅通的长向通道与两端门。逻辑检查与实际加载的 GLB 共同验证实物承载、门口到台前的路线和清洁占用。

机器通过 `state.on` 驱动正面的指示灯。机器安装面为 `counter`，杯子使用 `tray` 或 `counter`。同一只杯子移到柜台时使用 `attach-surface` 操作并保留实例 ID。留有安装面的单件柜体、设备和杯具也可单独出样。服务和清洁区域为使用空间预留，角色操作由游戏联调验收。

## 独立制作第五款

在独立副本内使用[加宽搁板示例](../../assets-source/company-tea-station-v1/examples/open-wide-shelf-v2.json)。它改变实体搁板和端部护条。可编辑输入、原始模型、来源与许可记录都随正式包移交。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-tea-station-v1/examples/open-wide-shelf-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-tea-station-v1/examples/open-wide-shelf-v2.json
```

完整接收方复验入口为 `test-tea-station-handoff.mjs SEALED_PACKAGE FRESH_LOCKED_WORK NEW_OUTPUT_DIRECTORY`。传入留存的正式包、已按锁文件安装制作依赖的独立副本和新输出目录。浏览器预览使用 `qa-tea-station-rooms.cjs PACKAGE BUILD NEW_OUTPUT_DIRECTORY --record`。制作副本、复验产物和正式包各按项目目录约定归档。
