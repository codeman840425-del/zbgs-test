# 活动过渡带真实源间隙 v1

父源为 `layer-transition-v1`，SHA `d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa`。本件 GLB SHA `148ad6a3c4d03d461240185069377abc1fd4422f0aa8220203c1e309b0db2e9b`。只生成一个候选；未安装运行时，未改变身体/动作/碰撞判门。

## 制作差异

实际58394私有palette站姿中，面418/658和808最薄点存在可用层间空间。`witness-space.json` 是点级可行性，不是整面合格证据。随后用完整三角最近点（顶点—面和边—边）产生源位置约束，固定48轮上限，源点位移不超过3mm；2.010mm为求解目标，原2mm验收门不变。没有使用旧稀疏七点fit，没有自动扫描不同余量或款式。

最终仅30个源点改变，最大2.737683mm；0次位移限幅、0次不可解见证。上腰120面、20点真实接缝、所有UV/索引/权重/关节与下摆504点以后的源位置精确不变。相关面法线重算。全部1392点/2420面保留，无删身体、缩动作或遮挡。源边长比0.8284–1.1984、面积比0.8000–1.2787；这是作者版型变化，不是布料仿真材料通过。

## 独立导出面门

门使用实际GLB float32、原逆绑定、58394冻结的实际私有六骨及完整身体/open-top/真实椅变换；不以旧raw helper代替。全三角检查含固定上腰，活动域独立报告面260–2419。

| 检查 | 结果 |
|---|---:|
| 活动域站姿 body 最小间隙 | 2.114486mm，面393 / body335 |
| 活动域站姿 top 最小间隙 | 2.009992mm，面777 / top1225 |
| 站姿 body/top/椅交叉 | 0 / 0 / 0 |
| 全衣固定 zipper body 最小间隙 | 原0.338647mm，**未过全衣2mm** |
| 站姿/坐入/起身 self | 1 / 1 / 2，原内折边问题尚未组合修正 |
| 坐稳 body/top/椅/self | 192 / 0 / 98 / 95 |

活动域的静态2mm门实际通过；不能扩大成全衣准入、坐起通过或原生cloth稳定。坐稳没有制作装备作者响应，不把这个缺失包装为路线失败。四姿回放仍用冻结旧手表面，未来新裙闭环手接触必须重新检查。未做本件GPU图、完整动作或自然观感验收。

## 可重放与恢复

在 `m1-simple-skirt-worktree` 根执行；输出目录必须尚无同名GLB/门报告。

```powershell
python scripts/m1-assets/simple-skirt/build-active-gap-v1.py --out assets-source/m1/simple-skirt-v1/active-layer-replay-v1
& F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/gate-active-gap-v1.py -- --out assets-source/m1/simple-skirt-v1/active-layer-replay-v1
```

输入为父GLB、`private-layer-initial/capture.json.gz` 和三个已纳入版本的纯几何/GLB函数来源。真实生成脚本原样副本 `frozen-build-used.py` 的SHA对应build-report；后续规范入口仅新增独立 `--out`，全新目录重导GLB逐字节相同，见rebuild-receipt。不可将包内副本直接运行并误认为它的父目录是工程根；恢复时放回规范 scripts 路径。`source-deltas.json` 是可编辑位置差，Blend已真实保存、重新打开，原蒙皮/UV仍在。

首次检查有两次脚本装配错误：缺少struct导入及纯读取函数未支持UV的VEC2。均在写出门报告前失败，修复读取器后检查同一GLB；没有调整源点、门槛或隐去资产失败。源码SHA/依赖/输入文件列于manifest。素材许可沿原源链，不将派生改称CC0。
