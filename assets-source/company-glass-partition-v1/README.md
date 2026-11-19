# 地顶固定玻璃隔断

隔断基点位于底面中心。隔断宽 2.400 米、高 2.800 米、总深 0.080 米。早期分支表的试制高度为 2.400 米，在当前房间内会留下 0.400 米顶缝；制作新外观时使用本目录 contract.json 的实装尺寸。地面顶皮和顶棚底皮应相距 2.800 米。上下的满宽固定背板接触两处建筑表面，25 毫米槽口朝向板心，胶条两侧夹紧 12 毫米厚的实体玻璃。基准实体玻璃的上下边各进入槽口 22 毫米。导航占用与 80 毫米宽的固定背板对齐。结构为静止装配。

| 资源 ID | 板件和承托 | 材质与精细读图 |
| --- | --- | --- |
| glass-partition-clear | 单扇通高，两端进槽 | Kenney 原始玻璃，alpha 0.5019608 |
| glass-partition-frosted | 两扇通高，中间竖梃 | 两片均为磨砂，alpha 0.74、粗糙度 0.91；磨砂区按隐私面处理 |
| glass-partition-tinted | 横楣单独托起上片，与下片形成两种高度 | 上片烟青、下片青绿，alpha 分别 0.42 和 0.54 |
| glass-partition-framed | 两列三行，独立中梃与上下道横档支撑六片玻璃 | 深色实框与中性玻璃，alpha 0.30 |

每片透明网格仅用一种材质。透视面存 userData.glazingRole 为 pane，磨砂面存 privacy，框、锚轨、压条分别存 frame、rail、seal。不透明构件保留独立三角面。普通 alpha 混合和表面粗糙度决定玻璃外观；材质数值表示游戏渲染参数。

## 在两种房间查看和调整

从独立包目录运行 `node serve.mjs 0`，在打印的地址后追加 `?delivery=glass-studio` 打开直播工作室，或追加 `?delivery=glass-rental` 打开办公出租屋。在房间内选中隔断即可原位换款。在“调整位置与摆放”内拖放或转向后，保存公司方案，重开同一房间复核。清玻适用于需要看清家具或拍摄商品的位置；框、锚轨和磨砂隐私面会遮挡精细取景。出租屋的隔断左端贴墙，若增加凸出的踢脚线，须先把隔断移离墙面。

在包的 `source` 目录安装锁定的依赖后，可用 `node scripts/company-platform/test-glass-partition-rooms.mjs output/glass-room-check` 从两个生产输入复现房间及带货取景检查。再运行 `node scripts/company-platform/test-glass-partition-installed.mjs --rooms output/glass-room-check/rooms --output output/glass-install-check` 复核地顶轨、侧墙与重叠物品。每次复跑选择新的输出目录。

## 来源

original/sources.json 固定了原件、许可文件、原资源身份及 SHA-256。可移交的原件包含 Kenney Building Kit 的 wall-window-square.glb 及 CC0 文本。方窗原透明片是平面，清玻方案完整继承其原始 PBR 和发光色，另外三款从该材质调整。实体玻璃取自已登记的 screen-partition-glass@1，保留原玻璃的网格、UV、端面与实际厚度，其不透明框、压条的材质也随包保留。头槽、底槽、承托背板和分格由项目生成器制作。固定槽构造参考了 Optima 对单玻隔断头、底槽的说明。[Kenney Building Kit](https://kenney.nl/assets/building-kit) · [Optima 117 Plus](https://www.optimasystems.com/systems/optima-117-plus)

## 制作和再版

复制 parameters.json，在 designs 中编辑 bays（1 至 5 列）、rowFractions（有序横档中心相对于上下背板内表面之间的高度比例）及 barWidthM（米）。已登记的 ID 改动结构时提高 version。examples/framed-three-bays-v2.json 将六片改为九片，中央竖框分为两根，每根离中线 0.4 米，底面、顶面和阻挡不变。给制作方的示例任务可写为“把六格框架改成三列三行，保留下侧的挡路能力和上下锚轨，核九片的接触和透视后登记第二版”。

在源码根运行；每次试制指定一个新的工程内结果目录。

```powershell
node scripts/company-platform/build-glass-partition.mjs --check
node assets-source/company-glass-partition-v1/check-geometric-controls.mjs
node scripts/company-platform/build-glass-partition.mjs --parameters assets-source/company-glass-partition-v1/examples/framed-three-bays-v2.json --output output/glass-partition-v1/production/receiver-nine-pane
```

首次在空的正式资源目录生成默认版使用 --write。接收方可用公司已有外观发布入口登记独立版本；在自己的可编辑交付副本执行。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-glass-partition-v1/examples/framed-three-bays-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-glass-partition-v1/examples/framed-three-bays-v2.json
```

collection.json 将 GLB、资源卡路径和实物顶点的 SHA-256 关联到配方。每款保存三角面数量、端面支撑测量点数、实际片数、各片厚度与不透明度，以及 437 条跨越隔断的采样线。房间安装另按房间实际地面、顶棚和邻近设施复核。
