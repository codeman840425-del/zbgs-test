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

本版的麦架、谱架和相机均按静置设施交付，资源的 `usePoints` 为空。演唱者口眼坐标用于房间布置。后续真人站麦接入时，场景侧需交付绑定到房间与麦架实例的稳定使用点、接近和退出区、朝向、接触及容量。总工用同一使用点执行移动、占用、取消和恢复；双方固定同一组合版本后实测。

## 谱面如何判定可读

每页使用谱架局部坐标，从纸边向内留出宽、高各 5% 的空白边，再从演唱者眼位检查真实网格。七列覆盖内外端和中央，每列检查五个纸面高度。对带浅浮雕谱线的模型，还从实际三角面确定该列穿过的细线高度并逐行取点。当前原稿每页九组五线谱，五列穿过全部 45 根线，每页共检查 260 处。中心继续检查原有视角和距离。以上为有限取样，样点之间的微小遮挡仍可能漏检。

批量生成、编辑存档及封包遇到被挡谱面会返回 `singing-score-occluded`，回执含页号、页内采样位置、眼位、目标点、首个遮挡设施及网格。调整布局后可用同一操作重新验证，已有合格产物保留。谱架调高或降低时，这些位置由实际安装后的模型重新计算。

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
