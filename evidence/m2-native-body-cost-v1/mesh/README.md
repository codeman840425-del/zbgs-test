# 7586 网格派生 CPU 核验

选择 `prefix-body.vrm`（`ca4ab17f4a8a`）供纹理处理和运行验证。固定源为游戏提交 `cfca0dd1` 的 `7586d3bc0921`，完整源/派生 SHA、每个 primitive 的材质、引用范围、角点及逐字节核验量在 `prefix-analysis.json`，Three 实际加载结果在 `prefix-three-comparison.json`。

| 身体单资产指标 | 源 | 派生 | 预算 |
| --- | ---: | ---: | ---: |
| 各 primitive 声明的顶点数之和 | 83,462 | 79,806 | 80,000 |
| 不同 POSITION accessor 顶点数之和 | 13,867 | 14,920 | 30,000 |
| 不同形态 accessor 字节数之和 | 6,441,912 | 7,882,416 | 8,388,608 |
| 模型三角形数 | 23,566 | 23,566 | 40,000 |
| RGBA8 含 mip 估算字节数 | 117,791,068 | 117,791,068 | 100,663,296 |

原脸的 8 个材质组共享 4,709 个源顶点，身体的 5 组共享 9,158 个源顶点。逐 primitive 从索引提取不同顶点合计 13,867 个，索引共 70,698 个角点。房间可见性、GPU 顶点着色器调用数及 GPU 内存须在实际加载路径测量。

派生在满足现有顶点预算的单个零起点连续区间中选择裁剪量最小的一项。该项为嘴部，实际索引只用 0–1,052。通过子 accessor 让位置、法线、UV、骨骼索引、权重及 57 套形态只读取这些行。其余 12 项、全部索引号、角点顺序、VRM 表情绑定、骨架及整段源 BIN 均保留。Python 比对 37,940,208 字节角点属性。Three 的 GLTFLoader 另外读取两份 VRM，在发生变化的 primitive 上调用官方方法，再比对 13 项的实际索引、属性、形态与骨架。比较跳过图片解码，未建立 WebGL 上下文。

嘴部更短的 POSITION 数组改变静止蒙皮包围球。实测半径从 0.145060 缩为 0.033438，中心坐标已记录。这会影响依赖全数组的包围体计算，房间的剔除、排序、讲话和镜头边缘须实际检查。依赖原始长度或哈希的脸部配方须重新核对。眼镜拟合读取的 Face Skin、Iris 几何仍完整。眼镜、麦克风、肤色覆盖、法线共享和角色记录各自按身体 SHA 绑定，派生须保留来源关系并走现有身份核验。原身份可继续从当前游戏包恢复。

## 首次方案的诊断

`partitioned-body.vrm`（`649984d4ba49`）将五个无形态身体 primitive 按连续、不重叠的源区间拆分，各自重基整数索引，预算读数 46,830。文件角点属性全部一致；GLTFLoader 在每个 SkinnedMesh 上归一化权重，源的五组共享缓冲会归一五遍。独立裁剪结果的三个材质中有 48 个权重分量与源的实际加载结果有差异，最大绝对差 2.98×10⁻⁸。诊断中补执行四遍原库归一化可精确复现全部差异。保留此方案用于说明文件角点相等与运行时处理的区别，具体数值及索引迁移量见 `analysis.json` 和 `three-comparison.json`。

## 复现

在工程根目录执行。Python 使用 NumPy、Pillow 和现有预算器，Node 使用 prototype 锁文件中的依赖。

```text
python scripts/production/native_mesh_budget_prefix.py
node evidence/m2-native-body-cost-v1/mesh/compare-three.mjs prefix
python scripts/production/native_mesh_budget.py
node evidence/m2-native-body-cost-v1/mesh/compare-three.mjs partition
```

参照实现使用 Three 0.187.0、pixiv three-vrm 3.5.5（MIT）。项目已有两份独立角色的渲染侧脸部压缩接法，见 `prototype/src/face-render-compaction.js`，其保留原始几何供配方读取，并保护透明排序依赖的包围球。[官方按索引移除未使用顶点的实现](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm/src/VRMUtils/removeUnnecessaryVertices.ts)
