# 接缝局部共形细分：已有实现与已存源数组核查

**建议仅用 Blender 官方 BMesh 拆 Body 的 41 条必需接缝边，再三角化受影响面；Face 复用已经保存的共同一级细分。** 这与全 Body/全 G slab 加细不同。只读数组已确认：必需中点不会继承全 Body 的 482 个 >4 骨影响问题。官方实现具备相应局部拓扑操作，但本包未启动 Blender、生成第三份拓扑、求 G、运行候选碰撞或导出；以下是可执行方案，尚非已通过样件。

## 已实际读回的选择集合

`read_existing.py` 仅读取已封 `m2-source-subdivision-seam-v1/generated` 数组，输出 `readback.json`，输入 SHA 全列在文件内。按每条原 Body 边的**无向精确端点坐标对**取 41 接缝的几何重复闭包，遍历全部原 Body 边；不焊点、不用近邻容差、不重新运行 subdivide。

| 已存数组核查 | 结果 |
|---|---:|
| 原跨 accessor 对应 / 不同几何边 / 必需 Body 索引边 | 41 / 41 / **41** |
| 额外精确几何重复 Body 边 | **0** |
| 必需中点最大实际影响数 / >4 点 | **1 / 0** |
| 必需边两端完整 joint 权重是否相同 | 全部相同 |
| 必需中点三骨姿已存 LBS 插值差最大值 | 2.25914018e−16m |
| 相邻原 Body parent 三角 | **39**，全部 Body_SKIN |
| 每个相邻 parent 被选中的原边数 | 37 个切1边；2 个切2边 |

这里每个必需中点都来自骨权相同的原边，因此在同一个线性蒙皮骨姿下，其原源中点蒙皮与两端蒙皮中点在实算术中一致；三姿读回支持这一点，不代表所有其它 Body 边也成立。不会创建原全 Body 细分中那些无关新点。若操作严格只插入这 41 个中点并在 parent 内补对角，**预测** Body 为 7896 点/12049 三角，而非此前 27581点/48032三角；这是计数推导，未制造该网格。

全 Body 包的 482 点 overflow、2.644mm LBS 差和失败状态保留；其 123 条跨 slab overflow 边也不因此变为通过。本方案解决的是 Face–Body 共同边采样，**不自动改善其它 Body 粗三角经 G 后的弦面误差**。

## 已核官方操作及属性责任

本机存在 `experiments/tools/blender-4.5.9-windows-x64/blender.exe`，PE 仅报告4.5；本包未运行版本/API smoke。以下固定到官方 `v4.5.9` 源码，执行包需核真实版本身份。官网 API 页面本次读取受阻，直接核官方源码；相关文件均标 GPL-2.0-or-later，作为离线 Blender 工具使用，不拷入浏览器运行链。

1. [操作定义](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/intern/bmesh_opdefines.cc)明确 `subdivide_edges(edges=..., cuts=1)`、单边三角补面开关及输出几何集合；没有提供完整 parent-face map。[细分实现](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/operators/bmo_subdivide.cc)按选中边拆分，一边三角可连到对角顶点；两选中边另有连接分支。其余原边不必传播加细，余下四边面可交给官方 `triangulate`。
2. [BM_edge_split](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/intern/bmesh_mods.cc)拆的是共享 BMEdge，关联面一起获得新顶点；跨 accessor 或不同索引的几何副本不会自动同步，必须按已核选择集合分别处理。[loop 插值](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/intern/bmesh_interp.cc)沿各 radial face 的 loop 单独插值 CustomData，能保留面角 UV 的独立身份，不应先 merge-by-distance。
3. [deform CustomData 插值](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/blenkernel/intern/customdata.cc)按 `def_nr` 合并加权，不做固定四项截断。因此本案的一骨中点有直接对应；仍须用原 skeleton joint-ID 对照真实输出，不能用新顶点组序号猜原 JOINTS。
4. [面拆分 core](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/intern/bmesh_core.cc)从原面复制面属性；[triangulate mapping](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/tools/bmesh_triangulate.cc)提供新 face→输入 face 的映射。因此应预挂整数 `source_parent_id` 面层并保存原 material/primitive/triangle 表，再对映射和自定义层双向核对。BMesh 索引不是永久 ID；不能把输出 face 顺序当 parent。

作者 N 另有边界：subdivide 会插值并归一化自己的几何顶点法线，操作也可重算法线，**不能直接拿 `BMVert.normal` 覆盖原作者 N**。最小接入让 BMesh 负责拓扑和来源，最终原点属性仍从封定原数组取；每个新点按来源边的 `.5/.5` 稀疏行生成位置、UV/作者 N 和完整 joint 权重。原 loop UV 与 BMesh 插值做读回比对；保原材质/索引缝和各自属性，不重新平均成单一法线。Body 无 morph；Face 54 targets 沿已证同 S 数据复用，不经 Blender 重新烘焙。

## 最小执行合同，尚未执行

可用的固定调用组合为：

```python
bmesh.ops.subdivide_edges(
    bm, edges=required_original_edges, cuts=1,
    smooth=0.0, fractal=0.0, along_normal=0.0,
    use_single_edge=True, use_grid_fill=False,
    use_only_quads=False, use_sphere=False,
)
bmesh.ops.triangulate(
    bm, faces=affected_nontriangle_faces,
    quad_method='FIXED', ngon_method='EAR_CLIP',
)
```

准备时保留原 BMVert 对象→source-ID 映射，原 BMEdge 挂 source-edge-ID，原 BMFace 挂 source-parent-ID；新点从原选中边的两条半边来源恢复，不相信新点自动插值出来的整数 ID。用原点/边中点的稀疏支持重建每个 child 在原 parent 中的 bary；要求支持仅落本 parent、朝向/面积一致、无新增退化。UV 和作者 N 不通过 BMesh 自动法线回写。对同一源得到的映射及拓扑只生成一次，在所有形状请求复用。

下一有界小样应先核单边三角、双边三角及带独立 UV loop 的共享边属性/parent继承，再只处理这 39 个原 parent。正式原源回读要求：仅新增41点；未选中原边不被切、未受影响原三角不变；41接缝两侧中点/半边一致、没有 T 节点；旧点/属性/skin/IBM/Body无morph保持，新增权重≤4且与已存一骨期望相同；source-parent/material/loop与稀疏来源完备。若 BMesh 产生额外点、传播到其它边、parent丢失或属性不符，保存失败后停，不手写补网格、不截骨权、不扫不同 triangulate 策略。

这只能解除原源拓扑消费前置。后续仍要验证实际 G 的全部旧门、细分后 parent 接触含义及新增内部边规则；`m2-source-subdivision-seam-v1` 的 `accepted:null` 分类未决保持，本报告没有“消除 strict 缺陷”。局部 Body 不是新的碰撞修正，也不能保证 Face 混合表达接触消失。root 决定是否执行小样；本包到此停止。
