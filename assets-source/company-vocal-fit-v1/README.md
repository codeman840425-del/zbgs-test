# 圆盘短臂唱麦的拾音规格

`floor-vocal-mic-disc-fit-lower@1` 使用 `floor-vocal-mic-disc@1` 的圆盘、脚垫与带贴图的话筒。制作配方的单位是米和度，坐标以地面为原点，+Y 朝上、+Z 朝歌手。每次生产一款固定姿态，游戏读取成品 GLB。角色、房间站位和运行时接替由场景包验收。

## 可编辑输入

从 `parameters.json` 复制配方，给新设计分配独立 ID 或提高版本。`boomPitchDegrees` 围绕 Grab3D 机头的原 X 轴枢点 [0, 1.3300000429153442, -0.18028409779071808] 设置绝对俯仰，可取 −8° 至 −4°。`forwardMetres` 将整个机头向 +Z 平移，可取 0 至 0.047 m。成品在资源卡的 `microphone.pickupFit` 中登记这两项功能规格。该候选取 −4°、0.044 m。真实夹子、机柄、卡圈、网头及其纹理整体跟随这次变换。

原底盘的三只脚垫和外套管固定。生产器把原合并导出的内外立杆、上下锁圈和臂端接头按各自三角面重新分开，由夹子的新位置反解立杆下压量、短臂角度和细管外伸量。伸臂细管长度固定为 0.154 m。基准配方中立杆套合 0.05754 m，臂管套合 0.09408 m。技术量测保存在 `collection.json`。里面包括世界坐标下 8 个部件的逐顶点检查、12 对机械连接的实体截线、接地和正面射线的首次命中点。此射线从正面照向网头中心；实际唇缝位置随角色和房间而变。

## 生产与回读

从公司平台主目录运行以下命令。试制目录须为尚未存在的新目录。

```powershell
node scripts/company-platform/build-vocal-fit.mjs --check
node scripts/company-platform/build-vocal-fit.mjs --write
node scripts/company-platform/build-vocal-fit.mjs --output output/vocal-fit-trial
node scripts/company-platform/build-vocal-fit.mjs --parameters assets-source/company-vocal-fit-v1/author/recipe-<hash>.json --output output/vocal-fit-edit
```

最后一条命令中的项目相对路径需换成实际配方快照。试制输出镜像正式的源清单及游戏资产路径。正式写入会核对已有文件字节，相同版本可重跑，签入内容冲突时会拒绝。生成失败后可在同一未发布的目录重试。恢复原设备可选回 `floor-vocal-mic-disc@1`。

## 接收方生成另一种拾音位置

在交付包的可编辑源码副本中运行以下命令。样例将机头前移量从 44 mm 改为 43 mm，采用独立设施 ID。改变拾音位置会影响角色接触，需要显式发布新规格，并将房间配方中的麦架引用指向新 ID。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish-fit assets-source/company-vocal-fit-v1/examples/shorter.json
node scripts/company-platform/publish-room-appearance.mjs --check-fit assets-source/company-vocal-fit-v1/examples/shorter.json
```

用同一句命令重复发布同一份配方时，目录中的资源版本可继续复用。普通外观替换会拒绝把原麦架的使用点改为新拾音规格。双房接触复算的输入来源与命令见相邻的 [57 次原始观察说明](../company-vocal-fit-check-v1/README.md)。

## 来源

Grab3D 的原始可编辑文件、GLB、512 像素 PBR 贴图和 CC0 许可沿原唱播生产回执核验。新资源卡另固定圆盘源模型、源资源卡、旧配方和旧生产脚本的 SHA-256。[Grab3D 模型页](https://grab3d.com/models/music/microphone-stand/)

套合立杆、高度锁和两段伸缩臂参考 König & Meyer 210/9 的机构说明。项目继续使用自己的圆盘底座和短臂几何，长度和行程来自本项目的工作包络。[König & Meyer 210/9 官方技术资料](https://www.k-m.de/en/kmPdf/datasheet/ordernumber/21090-300-55)
