# 唱播间的制作与验收

同一批次提供两份可编辑房间。6 米见方的工作室从南门进入；整套出租屋的唱播房为 4.5 × 4 米，东门与客厅相连。两房共用一支落地悬臂麦和一副三脚谱架，镜头、桌子、背景和灯光各自配置。在人类预览中点 **机位取景** 可以看实体相机拍到的环境，选中谱架后点 **聚焦物品** 可以直接看谱面。[双房输入](../../scripts/company-platform/batch-inputs/singing-rooms.json)

## 制作输入

在批次项的 `singingRooms` 内为每间房写入以下字段。角色名称指向实际已安装的实例，坐标长度单位为米。

| 字段 | 约定 |
| --- | --- |
| `regionId`、`portalId` | 本间经营房及供演唱者进入的真实门。公共区入门须从相连区域通到站位。 |
| `roles.mic`、`roles.score`、`roles.camera` | 两个地面三脚架和一个有镜片的桌面相机；相机跟随本房的承载桌。 |
| `performer.position`、`yaw` | 房内平面位置 [x,z] 和朝向弧度。面向为站位局部 +Z。 |
| `performer.mouth`、`eye` | 相对该站位的口、眼参考点 [x,y,z]。转房间、转站位或换设备后复核。 |

制作检查保护宽 0.50 米、高 1.90 米的站位及入场通道。口位到实际麦网的首个命中、网头与麦柄及夹头的连续接触、两页谱纸各自的正面视线、镜片到口眼的取景、桌面承载和两组三脚着地分别计算。具体测量值随房间写入批次报告。真实站立身高、演唱动作、口型与音频需要相应的角色或业务系统。[测量程序](../../scripts/company-platform/check-singing-room.mjs)

## 发布另一款器材

制作 agent 可以只改一支麦的俯仰，也可以只调整谱架高度。在可写接收副本的 source 目录复制参数配方，给新款分配独立资源 ID 或版本，再用已有发布入口登记。原版本继续被旧房间引用，设备外观和房内摆放可分别修改。[来源、可调范围与重导方法](../../assets-source/company-singing-stage-v1/README.md)

```powershell
node scripts/company-platform/build-singing-stage.mjs --check
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-my-singing/parameters.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-my-singing/parameters.json
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/singing-rooms.json output/singing-rooms
node scripts/company-platform/check-singing-room.mjs output/singing-rooms/singing-rental/layout.json
```

将改款用于自有房间时，复制批次并更新对应实例引用。修改后的口眼位置、入场、遮挡以及关机重开可以用下面的回归重跑，输出选新目录。生成目录内保留每间房的原始输入、布局、存档和实测报告。

```powershell
node scripts/company-platform/test-singing-room.mjs output/singing-check
node scripts/company-platform/test-singing-stage-source.mjs output/singing-source-check
```
