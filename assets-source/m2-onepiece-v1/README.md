# 原男性连续连体练功服技术源

实际游戏候选是 `generated/author-export.glb`，其装备声明为 `generated/author-equipment.json`，适配记录为 `generated/fit.json`。运行 ID 为 `m2-male-training-onepiece-v1`，款式与原男适配分别用 `male-training-onepiece-v1` 和 `original-male-training-onepiece-fit-v1`。尚未在本包内注册运行资源或验证游戏动作。

服装从完整原男性 Body 皮肤的连通表面裁制，胸、腰、骨盆、裆和双腿属于同一连续网格。原 top 和 shorts 的面均未复制。颈口、两个短袖口和两个裤口共五个边界环，另建内表面和实厚封边，最终作者 GLB 有一个闭合连通壳。原男性 Body 的 7340 个三角和原服装资源保持完整，没有新身体遮罩。

原男 SHA 为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。裁切坐标为原 glTF 米制 Y-up，正面为 -Z。颈口 Y 为 1.465 m，短袖口为 |X| 0.195 m，裤口 Y 为 0.676898 m，约膝上 100 mm。外表制作偏移为 9 mm，厚度 2 mm，名义内表偏移 7 mm。它们不代表弯曲姿态的实际净空或坐面层厚，后者仍需游戏接触测量。

原身体绑定与权重沿实际 Body 三角保留，裁切边插值后使用四个最大影响并归一化，最大截断量约 0.88%。UV 缝焊接后的连续几何法线用于推壳，避免把单侧 UV 法线用于中缝。2356 点、4724 三角，16 根实际骨。导出的权重另核 Blender 4.5.9 移除小于等于 0.0001 影响并重新归一化的确切规则，作者三角顶点与参数源位置逐角一致。

`initial/editable.blend` 是 7 mm 参数的实际可编辑旧源。制作时重新打开它，将网格真实编辑为最终 9 mm 参数及连续缝法线版，另存 `generated/editable.blend`，再分别回开两次导出。最大实际改源位移为 12.048 mm，含 2 mm 参数变更和缝法线修复。交给游戏的 GLB 来自这一改源版本。`repeat` 独立参数重建后再次从相同旧源编辑，参数 GLB 与作者 GLB 分别字节一致。`mesh-source.npz` 保留身体参照表面、裁切拓扑、法线、蒙皮和壳数据。

当前完整身体静态检查记录 44 对身体三角交叉，都集中于裆前约 X ±11 mm、Y 0.899–0.915 m。21252 个顶点、面心和边中点的最近面法向采样给出约 1.576 mm 最大向内深度。这是近面诊断，不能当作严格体积或完整三角最大穿深。368 对非邻接自交含外表、内外层与封边。源图显示胸下小褶和臀沟夹线，未看到大片裸露或开裂。以上数值与局部折返保留，是否影响正常动作由运行验收判断，不以交叉计数为零作为通过门。

`failed-authored-seam-normals` 保留首个未修缝法线的 9 mm 源、导出和 202 对身体交叉报告。`rebuild` 是该旧法线算法的中间重复产物，最终重复检查使用 `repeat`。失败没有更换为新版本标签。曾讨论距离场外包络，尚未实施。

来源沿 `assets-source/foundation-male/source.json` 和 `LICENSE.md` 的已存档 hecko / VRoid Project beta 基模条件。本地生成脚本与连体服裁制为项目新制派生，`provenance.json` 保留原来源与限制。旧 CC0 依据不扩展到当前 Studio 预设或任意第三方资源。本文件不构成新的素材授权。

需 Python、numpy 和现有 Blender 4.5.9。为每次重建指定新目录，脚本拒绝覆盖。旧源 blend 和其原始 GLB 已包含在包内，重建实际编辑源链如下。

```powershell
python scripts/m2-onepiece-v1/build.py --out fresh
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-onepiece-v1/author.py -- --out fresh --edit-from initial
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-onepiece-v1/audit.py -- --out fresh
python scripts/m2-onepiece-v1/finalize.py
```

最后命令核验并声明归档的 `generated` 与 `repeat`，不会把 `fresh` 自动推广。身份、错误 body/hash 拒绝、实际作者骨骼矩阵、闭合拓扑和重复性见 `generated/verification.json`。`generated/views` 使用完整 Body 和 CPU 检视材质，未使用游戏着色器或动作时间线。普通电脑、运动、坐姿、持物和关闭恢复仍需 root 集成验收。
