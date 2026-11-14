# 最后有界候选：规则环状独立 cage

**静态源准备完成，单次原生Cloth试验已拒绝，不是已修好的裙装。** 原始裙GLB、UV、褶皱渲染结构、身体、上衣侧面均保留；独立cage只作为离线原生Cloth的仿真表面，不增加通用runtime补丁。

源：`../open-waist-v1/` 已开孔且层次fit的裙初形。40角×13环：520节点、480规则quad、960验证三角。最短边10.22mm，中位27.12mm，最长49.03mm，没有<1mm边；最小三角面积139.59mm²。腰环横宽193.38mm/深137.04mm，裙摆横宽380.66mm/深283.66mm。没有膨胀身体或删除碰撞体。

`cage-and-binding.json` 保存每个原weld顶点的最近cage三角、重心权重、三角切线框架下的褶皱细节offset，以及原UV拆点映射和面索引。**仅carrier近似误差RMS3.546mm、max12.522mm**；保留细节offset后的静态原点重建误差小于1e-12m。这两个指标不可混用：重建为零是因为显式保留源细节，并非低分辨率cage完全等于原褶皱。动态局部框架运输已在离线试验实现，但回映render穿体，未通过验收。

已执行初形全三角检查：cage和重建原render分别对真实body/top均0交叉，均0非邻接自交，0未决共面。独立native BVH也为0；扩张3mm AABB候选后vertex-face与edge-edge精确距离：body最小0.460291mm、top1.313463mm，见 `native-initial-validation.json`。这些静态结果不代表动态通过。

可编辑文件：`regular-sim-cage.obj`、`original-render-reconstructed.obj`。JSON保留源glTF UV数值；使用OBJ在不同DCC绑定材质时须核其V轴约定，不能只凭文件存在宣称纹理正确。原带绑定/材质GLB在上一源版本保留。

复建与检查（无浏览器、无Blender）：

```powershell
python scripts/m1-assets/prepare-ring-cloth-cage.py
python scripts/m1-assets/qa-layer-rest-triangles.py --ring
python scripts/m1-assets/record-waist-arm-blocker.py
```

前两步本机约4秒与1.4秒，不是目标设备实时性能。此候选已避免上一试验的亚毫米狭长边，但没有解决碰撞稳定性。已执行唯一一次有界试验；不继续调参。

## 单次动态结果：拒绝

`python scripts/m1-assets/run-short-cloth.py standing-ring-cage-v1 --ring-cage` 实际2线程、0.978秒退出；上限60帧/60秒，因第3帧（0.066667秒）失败提前停止。第1、2帧sim/render均0交叉；第3帧sim与body4对、回映render与body23对，top均0。最大点位移9.467mm，最大材料边比1.01315，没有上一网格的短边过伸，但已经穿体。没有进入坐下，也没有制作游戏adapter。

`experiments/skirt-offline-corrective/standing-ring-cage-v1/` 保存完整3帧、失败形状、可编辑blend与日志。对保存帧独立执行 `python scripts/m1-assets/qa-layer-rest-triangles.py --recorded-ring`，逐帧复核sim/render全三角，重现4/23对body真实交线；两种表面全部3帧top0、自交0、未决共面0。运行后才补充的render自交gate没有冒充在原trial中执行，而由这次离线回查补齐证据。该回查没有重新运行物理。

## 给动作实施者的具体阻塞

`source-arm-blocker.json` 保存固定历史 `ca72ada827d2` 的frame76/77/78、原VRM SHA、准确body primitive全索引匹配、bodyfaces3556/3557/3792/3794的骨权重与世界三角、固定腰边世界端点。frame77为坐下进度0.40437，约源时间2.533秒；上述body面90.3–98.3%权重属于 `J_Bip_L_LowerArm`，左前臂扫过固定腰圈。pin点负侧5.5–9.5mm不能让cloth通过释放缝合腰口或删除手臂解决。

其中一条腰边世界坐标 `[2.74837,.98963,1.24713]→[2.74513,.99466,1.23546]`；另一条 `[2.73149,.96988,1.28918]→[2.72023,.96683,1.29610]`。这些pin索引来自 `local-sim-v1`，不是本cage索引。

JSON给出可重复的固定capture命令，新增独立label并拒绝覆盖；**本次没有重新启浏览器**。捕获需排独占窗口。后续当前运行版本若已修动作，应实际新捕获验证，不将历史ca72失败自动宣称仍存在，也不能将历史静态数据代替新版本通过。
