# 男性独立裁片开襟无袖外搭技术样件

从固定原男性 `base-male-roundtrip.vrm` 与原上衣的真实几何截面制作独立裁片，保留连续蒙皮、可编辑源和重复导出。身体 SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`，原 top SHA `393a2a97e9a933c4f8170720cf1d5792a18f282166abf7e5ffbba0d0de1fc32c`。

这是源几何与绑定检查候选。服装动作适配、游戏房间运行、保存恢复和普通电脑性能仍待验证。样件造型为简单技术马甲，局部轮廓仍有折线，当前检查不等于最终服装验收。

## 制作依据

左右前片与背片有独立、低密的网格结构，下侧缝与肩带使用共享顶点。原 top 作为截面、支承面、权重和叠穿参照。输出没有复制原 top 的面拓扑或沿其分裂渲染法线推壳。每条射线的区域、坐标轴、输入坐标、命中原三角、重心坐标和原面位置保存在 `generated/construction.json`。

下躯干使用前后截面与侧截面。上袖窿逐渐收至原上臂骨绑定横坐标内侧 20 mm，避免把 T 姿态袖子宽度当作躯干宽度。肩带沿原 top 的真实上表面截面跨过肩部，源采样点直接转移原面蒙皮。没有悬空的手填拱高，也没有把权重采样截到任意高度。原 9 骨均实际使用，所有 1139 个外表点有多骨影响，4 权重截断最大丢弃量约 2.792%。

新连续表面先建立几何法线，再生成外表 5 mm 基础制作间隙和 2 mm 厚度。原衣褶会超出稀网格平面，支持点测量为每个新裁片记录其覆盖原面采样的凸出高度，所得法线支持量为 5–10.742 mm。剩余背片内表面局部使用原 top 三角与裁片 XY 域精确裁切，按线性 Z 极值满足 3 mm 内层余量。前片 Z 修正最大 2.114 mm，背片最大 5.578 mm，逐点适配量均保留。几何检查实际在修正后的导出上执行。

`generated/editable.blend` 包含真实可编辑网格和骨架。两次重新打开该源导出，并独立由参数重建另一份源后重新导出。参数 GLB 与 Blender GLB 各自保持重复字节一致。Blender 4.5.9 导出器会清除小于等于 0.0001 的影响并重新归一化，`source-correspondence.json` 核对此确切规则及三角顶点位置。两种 GLB 的 SHA 不同，不能互换身份。

## 已检查与待检查

输出有 2278 个点、4560 个三角面、真实原 9 骨，原 inverse bind 与实际男性身体一致。外表面焊接，三个边界环分别构成衣缘和两个袖窿，厚度闭合。静态原始绑定 T 姿态的身体、原 top 与领带、原长裤、原短裤交叉均为零，自身非邻接交叉与退化面均为零。点到面最近距离仅作诊断。没有静态挂点、身体隐藏、cloth 动力学或任意体型自动适配。

独立 `styleId` 为 `male-open-vest-panels-v2`，`fitId` 为 `male-open-vest-panels-original-fit-v2`。`generated/author-equipment.json` 与 `fit.json` 给出实际 Blender 导出身份，`layerWith` 明确指向 `m1b-uniform-top`，下装限于固定原长裤和短裤。运行时尚未注册。原服装、原配方与公开清单由主线集成处理。

## 保留的失败

`initial-neck-transfer` 保留第一版直接最近点转移的候选及确切源快照，其悬空肩带错误采到领口并带入头骨影响。`failed-free-panel-grid` 保留首次自由裁片源、回开导出与静态零交叉报告，该版肩带悬浮、矩形硬板和侧边直角导致服装适配失败。其静态零交叉不代表可用。

后续 `sampled-underarm-first`、`sampled-coarse-lower`、`sampled-dense-lower` 与 `sampled-support-first` 保存局部截面版的过程源和接触报告。首个截面袖窿引用 T 姿态袖区造成轮廓外凸，随后以真实上臂与连续曲线修正。下躯干仍跨原衣褶的接触在最终几何中通过实测局部适配处理。对应旧静图使用各自目录保存，没有换成最终版本标签。

## 重建和恢复

需现有 Python numpy 与 Blender 4.5.9。制作新目录名必须不存在。

```powershell
python scripts/m2-outer-panels-v2/build.py --out fresh
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-outer-panels-v2/save-editable.py -- --out fresh
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-outer-panels-v2/audit-source.py -- --out fresh
python scripts/m2-outer-panels-v2/verify.py --require-static
```

`fresh` 为另存重建，验证脚本检查归档的 generated 与 rebuild 身份。`finalize.py` 只针对这两份正式源记录固定 fit、绑定和几何检查。`render-source.py` 输出原身体/衣物材质的源静图，未使用游戏 MToon 或动作时间线。导出失败时保留输出与错误，修正后改用新的目录，避免给旧检查换标签。

来源继承 `assets-source/foundation-male/source.json`，`provenance.json` 保存完整原记录与第三方 VRoid beta 基模出处和条件。此次裁片是本地新制派生，许可记录保留原来源限制。
