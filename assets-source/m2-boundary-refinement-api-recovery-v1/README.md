# BMesh 来源读回恢复：局部拓扑前置通过

**只修复来源读回，未改细分参数或保真门。** 原失败 `m2-boundary-refinement-preflight-v1` 保持封存。本包已完成单边因果仪表、三个最小 API 检查和一次真实原 Body 局部拓扑前置；Face 复用既存一级 S/54 targets。没有 G、真实候选 contacts、VRM 导出、runtime/4196 或舞裙修改。

## 因果证据与修复边界

`diagnostic/stages.json` 记录创建、subdivide、triangulate 各阶段的旧 wrapper 有效性、live 元素、整数 ID、坐标/权重、官方返回几何与 face_map。单边三角在 subdivide 前为3点/3边/1面，旧 vertex wrapper 全有效；**subdivide 返回后**为4点/5边/2面，三个旧 wrapper 全失效，但 live 中三个原坐标及 ID1/2/3、属性仍在。triangulate 后不再改变。新增中点自动继承 ID2，与旧点重复；不能把自动插值的整数层当唯一身份。

官方 [subdivide](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/operators/bmo_subdivide.cc) 添加/移除临时 shape-key CustomData；[update_data_blocks](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/intern/bmesh_interp.cc) 复制并释放旧属性块；[Python 指针层回调](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/blenkernel/intern/customdata.cc)使旧 wrapper invalid；[Python invalidate](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/python/bmesh/bmesh_py_types.cc)清其 bm 指针。这解释了实际失效，不能把报错字符串当原几何已删除。文件许可证均 GPL-2.0-or-later。

修复优先采用官方 `geom_inner` 返回的有效新 BMVert，按它相邻的原 source-edge-ID 验证唯一来源，记录继承整数后给新点写独立负 edge-tag。随后重新遍历 live `bm.verts`：正 ID 必须恰为全部原点、各一次；逐点精确核原坐标和 deform 属性；负 tag 必须恰为原选中边集合。triangulate 后再做同一检查。**没有最近点猜测、跳过原点、重新造几何或依赖失效 wrapper。** 修改差异保存在 `source-readback-only.patch`。

## 真实前置结果

实际 Blender **4.5.9 LTS / build8bf95cbd38d1**。三个 API 检查均过：单边三角4点2面、双边三角5点3面、共享边带独立 UV loop5点4面。共享点在两面保有不同 UV，parent 层、官方 face_map 与新点骨权都读回一致。

唯一真实原源操作耗时连同API/启动 **3.112秒**，进程树采样 RSS **291401728B**；单 Blender worker，外部 Python 仅作watchdog，180秒/2GiB预算未触发。先行因果三角另一次 Blender 调用工具墙时约0.60秒，未采其内存峰值；不可把主运行的采样峰值冒作总监控。后续数组独审没有重跑 Blender/G/拓扑。

| 检查 | 实际结果 |
|---|---|
| 原 Body 41边/39parent | 7855→**7896点**；12008→**12049三角**；仅新增41中点 |
| 未受影响原三角 | **11969** 个索引顺序精确保留；所有未选原边保留 |
| parent / material | 完整；每 child bary 可回原parent，朝向/面积通过；真实 triangulate face_map4项 |
| 旧点与属性 | 全7855原点、原 JOINTS/WEIGHTS、UV、作者 N 值精确保；source skin joint nodes/IBM独审一致 |
| 新点骨权 | 全1骨；全部Body最大4骨，overflow0；没有截权 |
| UV loop / 新点 deform | 后端插值误差均0；作者 N 从封定原数组按边 `.5/.5` 传递，未取 BMVert.normal |
| 41 Face–Body缝 | authoritative 中点精确一致，实际 node 权重相等，两侧半边齐，无这些已声明缝的 T 节点 |
| 三显式原骨姿 LBS | rest0、head20°+neck10°≤4.4432e−16m、eyes10°0；非录制动作/真实 manager |

Blender 新坐标内部使用Float32，对原Float32源端点 `.5/.5` 的Float64中点最大舍入差 **5.96046448e−8m**，单独保存在后端坐标读回。最终供后续求值的原源数组由已验证来源稀疏行精确生成；不拿 BMesh 舍入坐标或自动法线替换源属性。原点在BMesh内的坐标也精确保留。这是数据表示区别，不是放宽原2µm/2mm/J/strict门。

`independent-array-readback.json` 从真实原VRM及封存数组独立确认：原属性、IBM、S回放、11969未影响面、所有child parent位置、41跨accessor半边和Face54复用通过。首次失败的旧 wrapper 保真假设已被实际修正；没有据此宣布形状或表情通过。

## 原 G 后续消费的精确入口

**机器入口 `pre-G-source-inputs.json`** pin 所有文件、键、分区和稀疏格式。本包没有执行该消费：

- Body：本包 `generated/body-arrays.npz` 的 `newPosition/newNORMAL/newUV/newJointIDs/newWeights/newTriangles/parentTriangle/parentBary/materialIndices`；`S-body-csr.npz` 是 `{data,indices,indptr,shape}`，用 `csr_matrix` 构造，**不是** `sparse.load_npz` 格式。`body-provenance.json` 保原六消费者/39受影响parent，Body morph数0。
- Face：原封 `assets-source/m2-source-subdivision-seam-v1/generated/group-21.npz` 的 `newPosition/newDelta[54]/new_NORMAL/new_TEXCOORD_0/newDenseWeights/newTriangles/parentTriangle/parentBary`；Face仍7251点/12672三角，九消费者。`S-21.npz` 可 `sparse.load_npz`；`provenance-21.json` 保54原顺序和消费者。原source accessor7/21只是来源标签，不是新导出accessor。
- 新预G源合计15147个base点，真实端点数 **406701 = 7896 + 7251×55**。新triangle按parent表重新分配给原primitive/material；不能继续用旧index buffer或旧9911/120935覆盖声明。原骨架/IBM/VRM表达JSON/材质纹理仍以原sourceSHA为准。

后续必须用显式新身份、完整新固定眼语义端点mask/原neck/frame和真实101截面回读，不能自动借旧数值候选通过。其它Body粗三角并未细分；它们经G后的弦面仍需正常验。**新增内部边的 parent 接触分类仍未决**，本包没修该判断器或跑碰撞，更不表明lean混合/round单态问题已经消失。此处只交付可消费的共同源拓扑前置，后续由root安排。

下一有界数值验证可直接读取这些预G数组及已封identity/两男PPoly系数，无需再造拓扑或曲线；每case仍完整读回原101/fixed/J/Float32。known-oh 次序对照只需 Face 的 P、原序 D4(ALL_Joy)、D11(EYE_Close)、D32(MTH_O)、D15(EYE_Joy)，以及按新三角 parent→material 得到的补偿 lane。Skin/White/Eyeline/Eyelash 的源组合 `C=P+.65D4+D11+.66D32-.65D15`，其它原角色去掉末项；不把材质私有 lane 混成统一全脸权重。A 用对应已映端点线性合成；B 用同一个 G 计算 C，二者保存原源C、A、B及逐点差，随后用同一合法三角判定比较，不能把A−B距离当接触/视觉严重程度。B这一混合端点求值须在新spec显式列为补充样本，可与完整端点批次一起求值，不能伪称仅已有55端点足以推出B。完整重算数值候选不等于准入；成熟三角交判的实现/许可/安装/原parent语义尚需独立落实，本包没有切换原strict或扩写碰撞平台。
