# 壁挂室内机适配样件

本样件用于 `hvac` 的室内高位壁挂规格。美术原稿为 Innerscene 发布的 CC0 模型，单位米。室内机保留原导风板、壳体、进风格栅、安装板和状态窗。壳体下前沿的两个原始三角面封住出风口，适配器在此处开孔、增加内壁与背板，并给导风板建立横轴枢轴。四张随室内机保留的原 PNG 及相应材质逐字节或逐字段核对，侧出管道保存在原件中。[原作者及许可](original/source.json) · [可编辑开口与铰轴参数](indoor-adapter.json)

安装原点为挂板背面中心，正 Z 朝房间内，Y 向上。静态安装包络为 1.00 × 0.35 × 0.22 米，全部所测开合姿态也要在此范围。试装将机体中心放在距地 2.24 米处。当前高挂规格要求安装包络下缘至少 2 米，以沿用地面通道。关机时风叶闭合、指示灯熄灭；开机的模式编号 1、2、3 分别表示送风、制冷和制热的视觉状态。原 GLB、两份导出和实际装入房间的关态 GLB 的身份见适配输出 `report.json`。

从工程根目录安装锁定依赖后，运行下列命令。已有输出使用 `--check` 复核，每次新试装使用新的输出目录。

```powershell
node scripts/company-platform/adapt-indoor-ac.mjs --output output/indoor-ac-sample
node scripts/company-platform/adapt-indoor-ac.mjs --check output/indoor-ac-sample
node scripts/company-platform/test-wall-ac-intake-rooms.mjs output/indoor-ac-rooms output/indoor-ac-sample/closed.glb output/indoor-ac-sample/report.json
```

以上是弧面首件的临时目录试装流程。正式目录沿用它的风道、风叶、挂板和状态灯。弧面、双舱、纵肋、阶肩四款各用独立资源 ID；编辑器可直接高位安装，也可在同一实例上换款。[四款参数](parameters.json) · [高位安装与运行合同](contract.json)

## 制作并交付新的机身

在交付包的工作副本中使用 `source` 作为工程根目录。`prototype` 下按锁文件安装依赖后，从工程根运行以下命令。前两行检查随包模型与注册目录，第三行使用真实双房配置测试安装、替换、状态与恢复。

```powershell
node scripts/company-platform/build-wall-hvac.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-wall-hvac.mjs output/hvac-room-check
```

第五款示例把纵肋从每侧 7 条增至 10 条并指定新 ID。普通发布命令将配方快照、模型和登记项写入工作副本，再次运行同一命令可复核相同输入。将该资源赋给房间中既有空调实例即可保留墙面位置和运行状态。[第五款配方](examples/fifth-ribbed.json)

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wall-hvac-v1/examples/fifth-ribbed.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wall-hvac-v1/examples/fifth-ribbed.json
```

交付物中的单元表现导风板和指示灯。将来顶挂或移动式设备沿其各自的安装规格接入。
