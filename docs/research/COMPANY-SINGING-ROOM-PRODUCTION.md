# 唱播间的制作与验收

同一批次提供两份可编辑房间。6 米见方的工作室从南门进入；整套出租屋的唱播房为 4.5 × 4 米，东门与客厅相连。两房共用一支落地悬臂麦和一副三脚谱架，镜头、桌子、背景和灯光各自配置。在人类预览中点 **机位取景** 可以看实体相机拍到的环境，选中谱架后点 **聚焦物品** 可以直接看谱面。[双房输入](../../scripts/company-platform/batch-inputs/singing-rooms.json)

## 制作输入

[带站立使用位的双房配方](../../scripts/company-platform/batch-inputs/vocal-use-rooms.json)用于向角色接入方交付可使用的麦架。旧配方继续使用房间坐标作为静态取景参考。新版在同一麦架实例上登记如下内容，台前人物面向麦架的局部 −Z 方向。

```json
{"coordinateSpace":"facility","slotId":"vocal","position":[0,0,0.77],"yaw":3.141592653589793,
 "approach":[0,0,1.12],"exit":[0,0,1.12],"mouth":[0,1.555,0.23],"eye":[0,1.64,0.215]}
```

站位、朝向、接近与退出坐标属于麦架。口眼参考属于站位，以人物局部 +Z 为前方。每槽一人，站立净空为 0.50 × 0.50 米、高 1.90 米。发布时会实测入口到各目标、进退的连续净空、嘴到实体拾音面的首个命中、谱面可读性和机位。移动麦架后若挡住原来的谱面或通路，应一起调整相关物件并复查。

游戏通过 `scene.describeUsePoint(micInstanceId+'#vocal')` 读取槽位。返回 `kind: "standing-vocal"`、房间／设施／槽位身份、局部与世界姿态、世界接近／退出位置、人体参考和实际拾音节点名。当前楼层可用 `scene.resolveUsePoint(id).pickupMesh` 找到实物；离屏使用逻辑描述。空闲移位沿用原 ID，重新读取变换。角色侧提供预约、时钟、竞争、取消与恢复，场景事务消费它传入的 `isUsePointBusy`。

交付清单 `usePointReports` 列出默认场景和具名房的 `use-points.json`。它们绑定对应 `save.json` 的 SHA-256。接收方按清单核对初始版本，编辑后从当前布局重新求值。独立封包会从实物检查重新生成使用点快照。[制作回归](../../scripts/company-platform/test-vocal-slots.mjs) · [接收方复跑](../../scripts/company-platform/test-vocal-slot-handoff.mjs)

在批次项的 `singingRooms` 内为每间房写入以下字段。角色名称指向实际已安装的实例，坐标长度单位为米。

| 字段 | 约定 |
| --- | --- |
| `regionId`、`portalId` | 本间经营房及供演唱者进入的真实门。公共区入门须从相连区域通到站位。 |
| `roles.mic`、`roles.score`、`roles.camera` | 两个地面三脚架和一个有镜片的桌面相机；相机跟随本房的承载桌。 |
| `performer.position`、`yaw` | 房内平面位置 [x,z] 和朝向弧度。面向为站位局部 +Z。 |
| `performer.mouth`、`eye` | 相对该站位的口、眼参考点 [x,y,z]。转房间、转站位或换设备后复核。 |

制作检查保护宽 0.50 米、高 1.90 米的站位及入场通道。口位到实际麦网的首个命中、网头与麦柄及夹头的连续接触、两页谱纸各自的正面视线、镜片到口眼的取景、桌面承载和两组三脚着地分别计算。具体测量值随房间写入批次报告。真实站立身高、演唱动作、口型与音频需要相应的角色或业务系统。[测量程序](../../scripts/company-platform/check-singing-room.mjs)

独立麦架、谱架和相机资源的 `usePoints` 为空。基础双房配方使用房间坐标完成摆放和取景。带站位的双房配方另外在已安装的麦架上声明稳定的角色槽位、进退点、朝向与容量。总工使用该实例槽位接入角色移动、占用、取消和恢复，并在双方确认的固定组合中实测。

## 谱面如何判定可读

每页使用谱架局部坐标，从纸边向内留出宽、高各 5% 的空白边，再从演唱者眼位检查真实网格。七列覆盖内外端和中央，每列检查五个纸面高度。对带浅浮雕谱线的模型，还从实际三角面确定该列穿过的细线高度并逐行取点。当前原稿每页九组五线谱，五列穿过全部 45 根线，每页共检查 260 处。中心继续检查原有视角和距离。以上为有限取样，样点之间的微小遮挡仍可能漏检。

批量生成、编辑存档及封包遇到被挡谱面会返回 `singing-score-occluded`，回执含页号、页内采样位置、眼位、目标点、首个遮挡设施及网格。调整布局后可用同一操作重新验证，已有合格产物保留。谱架调高或降低时，这些位置由实际安装后的模型重新计算。

## 自由新作和继承已验站位

房间编辑器的保存记录当前位置、状态与设施安装检查。唱播发布另会读取整间房的麦头、谱面、门口和镜头。只转麦架 90° 后能保存，并不保证人物仍能读到原处的谱面。整组平移或转向时，请用发布入口复查取景、拾音和读谱。

新制房间可以更换或移除站位。裸存档封包后，转交清单 `roomOrigins` 对该房记录 `independent`。携带原始批次输入并通过相应声明比对的房间记录 `batch-declared`。要向角色接收方交付沿用已验麦架站位的新布置，请在常规封包命令上为每个目标房间追加下列参数。默认房键为 `@default`，具名房使用实际键。

```text
--inherit-vocal 输出房键 原始交付目录 原始交付清单SHA256 原始房键
```

此时发布器核验从提供方取得的清单 SHA、所选源房存档和它自己的站位清单，并要求新房保留相同麦架、槽位和局部人体参考点。改动设备在房内的位置仍需要通过完整唱播测量。通过后清单为该房记录 `inherited-vocal`、来源房键、清单及数据摘要。历史包可凭其确切清单作为已审来源，历史清单本身保留原语义。

角色接收方可以从新包中运行以下命令，再将返回的目标房槽位和当下世界坐标交给既有角色控制器。两个清单哈希分别取自双方确认的交付；具名房缺站位时必须报告该房的问题。文件完整性和槽位继承是分别可核对的事实。

```text
node check-vocal-origin.mjs 输出房键 新包清单SHA256 原始交付目录 原始交付清单SHA256 原始房键
```

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
