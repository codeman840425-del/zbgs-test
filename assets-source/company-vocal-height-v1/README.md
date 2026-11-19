# 两档圆盘唱麦

低档使用 `floor-vocal-mic-disc-height-low@1`，标准档沿用 `floor-vocal-mic-disc-fit-lower@1`。房间根据身材选择固定的资源 ID。坐标单位为米，底部原点，+Y 向上，+Z 朝歌手。两档的脚点、短臂俯仰 −4°、前伸 44 毫米相同。低档卡片的 `microphone.pickupFit.mastDropMetres` 记录从标准档向下的位移。

## 制作依据

固定角色报告里，两间房共 20 个女性讲话帧的唇缘高度中位数为 1.3660421244 米。目标网头包围盒中心高出该值 20 毫米。以原网头中心 1.5504148 米为起点，沿立杆向下降 0.16437267564332592 米。输入文件身份、计算规则和原模型身份见 [source-record.json](source-record.json)。站位局部的口、眼和人物身份由房间身材配置持有。

网头、柄、夹、原 UV 与内嵌 PBR 纹理来自已登记的 Grab3D CC0 麦克风。原站架保留圆盘、脚垫、内杆、转轴、两段短臂、夹头和各自的连接。新制外套管采用贯穿内孔，上口带导向衬套和横向螺钉孔。一侧的手轮压紧内杆，另一侧可调节的六角止挡提供承压点。上下两档分别按实际锥形内杆的半径确定螺钉落点。K&M 使用说明提供伸缩管配手拧锁紧螺钉的机械参考，三角网格由本项目生成。[Grab3D 原作](https://grab3d.com/models/music/microphone-stand/) · [K&M 使用说明](https://www.k-m.de/media/pdf/2b/84/f3/25680-577-55.pdf)

## 离线复产

项目依赖依照 `prototype/package-lock.json` 安装后，从源码根目录执行以下命令。首次写入使用 `--write`，已有发行文件用 `--check` 逐字节复核。生成器同时回读两个端点，标准档几何在内存中重建，正式发行只增加低档。

```powershell
node scripts/company-platform/build-vocal-height.mjs --check
node scripts/company-platform/build-vocal-height.mjs --write
node scripts/company-platform/build-vocal-height.mjs --parameters assets-source/company-vocal-height-v1/parameters.json --output output/vocal-height-profile-v1/mic/my-new-trial
```

`--output` 接受项目内 `output/` 或 `company-workspace/production-trials/` 下的新目录。修改已有配方时使用新的资源 ID 或版本。要制作另一档，可将上例的参数文件换成 [eighteen-mm.json](examples/eighteen-mm.json)。它引用经摘要校验的 f06 帧，按唇缘 1.3653426463 米加 18 毫米计算网头目标，得到降幅 0.1670721537 米。新的采样文件须给出同一坐标系的唇缘、帧 ID 和文件摘要。生产命令会检查高度计算、内杆套合和锁止，换高度须随站位规格显式发布。

## 复核数据

[collection.json](collection.json) 记录正式 GLB 的 SHA-256、两个端点的网面矩阵、逐部件回读顶点数、脚点和装配测量。每档用 65 条轴向通孔探针和 64 个角度的实际径向截面检查套管与导向间隙，再用 10 条横向通道探针和两个实体压面检查锁止。高、低档的套合长度分别为 57.54 和 221.92 毫米，低档内杆下端距套管底部 633.08 毫米。保留原封盖、螺钉回退 4 毫米、遗漏转轴跟随和在网头前插入遮挡物均有对应的故障对照。

这些数值来自导出模型的几何回读。实物材料强度、螺纹寿命及承载扭矩需要五金选型与实物测试。
