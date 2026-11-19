# 壁挂室内机适配样件

本样件用于 `hvac` 的室内高位壁挂规格。美术原稿为 Innerscene 发布的 CC0 模型，单位米。室内机保留原导风板、壳体、进风格栅、安装板和状态窗。壳体下前沿的两个原始三角面封住出风口，适配器在此处开孔、增加内壁与背板，并给导风板建立横轴枢轴。四张随室内机保留的原 PNG 及相应材质逐字节或逐字段核对，侧出管道保存在原件中。[原作者及许可](original/source.json) · [可编辑开口与铰轴参数](indoor-adapter.json)

安装原点为挂板背面中心，正 Z 朝房间内，Y 向上。静态安装包络为 1.00 × 0.35 × 0.22 米，全部所测开合姿态也要在此范围。试装将机体中心放在距地 2.24 米处。当前高挂规格要求安装包络下缘至少 2 米，以沿用地面通道。关机时风叶闭合、指示灯熄灭；开机的模式编号 1、2、3 分别表示送风、制冷和制热的视觉状态。原 GLB、两份导出和实际装入房间的关态 GLB 的身份见适配输出 `report.json`。

从工程根目录安装锁定依赖后，运行下列命令。已有输出使用 `--check` 复核，每次新试装使用新的输出目录。

```powershell
node scripts/company-platform/adapt-indoor-ac.mjs --output output/indoor-ac-sample
node scripts/company-platform/adapt-indoor-ac.mjs --check output/indoor-ac-sample
node scripts/company-platform/test-wall-ac-intake-rooms.mjs output/indoor-ac-rooms output/indoor-ac-sample/closed.glb output/indoor-ac-sample/report.json
```

房间验收使用临时资源目录，在共用的加载、布置、状态与存档代码中核对原尺寸模型、两种墙面朝向和原工作站。当前只有这一款室内机样件。其余三款兼容造型、正式资源登记、两房界面逐款替换与独立交付仍待完成。顶挂、移动式空调采用各自安装规格。
