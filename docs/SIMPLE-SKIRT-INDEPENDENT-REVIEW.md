# 少褶裙 v1–v3 离线门独立审查

范围：只读 `experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1` 及对应 `scripts/m1-assets/simple-skirt`。检查现有 269 四姿输入、v3 真实 GLB 与脚本，未启动浏览器/Blender、未制作新版本。v4 正在制作，不继承本报告的资产核对结果。精确读入文件 SHA 见 `evidence/simple-skirt-independent-review.json`。

## 结论

没有确认的当前 v3 LBS 坐标或原 cap 面号错配。现有失败足以说明该静态新源尚未准入；不能据尚未制作的坐姿装备响应否定少褶路线。现有 RESULT 已正确区分这点。

有两项需保留的明确限制：CPU 纹理深度图并非游戏 GPU 可见性判定；`render-four-poses.py --open-top` 的交点叠图目前只可用于 standing，直接推广多姿会使用错误姿势的交叉面集合。后者不污染当前 v3 单 standing 报告，但应在下一多姿使用前修正。

## 数据与坐标核对

- capture 的 colliders 是当前可见真实 SkinnedMesh，保存实际 `getVertexPosition → matrixWorld` 世界点；`sourceSkirt` 单独读取原隐藏源 SkinnedMesh；`displayedSkirt` 单独读取约束后的显示裙。没有把显示裙当作新源坐标。主四姿 gate 的 baseline 是显示裙；source-waist 对照明确改用原始源裙，二者含义不同。
- 独立读取 GLB：v3 与原裙 skin 的 12 个骨语义名字/顺序、全部 inverse-bind 数值精确相同。capture `sourceBind` 为单位矩阵。gate 中 `boneWorld × inverseBind × sourceBind × position` 给世界坐标，椅子局部 box 角点用对应 world matrix；行/列转置关系一致。
- 原源四姿 LBS 与捕获世界点最大误差约 0.460 µm 是已有实际回读证据；本次没有重新运行 Blender。继承 bind 不能证明重新绘制的权重适体，也不能推广到其他非单位 bind/节点变换资产。
- 独立核对原上衣 GLB 第一个 primitive indices 与捕获 `m1-uniform-top_1.triangles` **逐值相同**。`check-open-top.py` 通过原→新点映射检验 surviving 点误差 <2 µm，再把新 top 面号映回幸存原 face IDs，并断言 pairs 等于原 cap 排除后的 pairs；当前原 cap 解释有实际索引依据。
- raw BVH 门使用未经 alpha 筛选的完整有限三角面交叉，含内部面；它不是体积包含测试、连续碰撞检测或可见缺陷数量。gate 的 status 明确是 raw admission，不能把未排 alpha 的 pair 全称露片。

## 16 top / 89 body 的精确定义

`compare-source-waist.py` 用原上衣非 cap 侧面顶点最低 bind Y = **0.8899230361 m** 作覆盖带阈值。选原裙非 cap 三角满足 **max(vertexY) ≥ 阈值**，不是裁切平面以上的子三角；原带 392 面，新带 2505 面。

- 原 source 站姿 16 top pairs：14 个不同裙面与 7 个上衣面；涉及裙面 bind Y 范围 **0.882281–0.945782 m**。
- 原 source 坐稳 89 body pairs：51 个不同裙面与 34 个身体面；涉及裙面 bind Y 范围 **0.841143–0.973870 m**。大三角跨越阈值后整面计入，远不只是腰孔边。

因此 89 不能称“89 个腰孔穿洞”，也不能据该带名称认定这部分全被背心遮住；16/89 不含可见性/穿透面积/严重度含义。现 RESULT 对这些限制表述正确。不同网格密度下不计算 pair 减少百分比。

## CPU alpha / 深度图的有效范围

正/侧 640×800 图使用同捕获身体/上衣/椅、同相机与真实 UV/纹理，采用透视正确插值，足以帮助定位大范围前鼓、层序交叉和形态差异。没有省略身体或椅子；Body/Top 本次使用到的 UV 均在 [0,1] 内，没有发现因 clamp 代替 repeat 而落入不同 tile 的当前输入。

但 `render-four-poses.py::raster/opaque` 与实际渲染有已确认差异：

1. CPU nearest 取 texel；实际 Body sampler 明确 LINEAR。alpha 边缘附近的通过/拒绝不保证与 GPU 一致。
2. CPU 一律绘制双面；实际 Body_SKIN FrontSide，Top 为 DoubleSide。CPU 没有按 material side 剔除。
3. CPU 对所有非 MASK 材质用 .01 阈值并写最近深度，未做 BLEND 混合/排序或 OPAQUE 忽略 alpha 的完整语义。实际 HairBack 等为 BLEND。此限制不能用“真实纹理”字样省略。
4. 交线仅取有限边交点及中点。可见检查对 projected 坐标 `round` 后读取单个像素并容许 1 mm 深度差；它与 raster 像素中心采样并非完全相同射线。只说明该采样附近可能外露。

所以当前 296 top pairs 的 257 正面 / 28 侧面采样值仅是 **potentially exposed**，不是 257/28 个 GPU 可见洞；36 body pairs 在两视角未被采到外露，也不能证明全过程隐藏或允许删面。原报告已有这些核心限定，本审查补明具体 sampler/side/blend 差异。

## 一个下一次使用前应修的具体脚本问题

`render-four-poses.py` 的 open-top 分支在每个 frame 内读取同一 `open-top-gate.json` 的 `unchangedBodyPairs/topPairsMappedToOriginalFaces`；该 gate 由 `check-open-top.py` 固定取 `frames[0]` 生成。当前 v3 `generated.poses` 只有 standing，因此当前图无此错配。若 v4 使用同分支渲染四姿，坐入/坐稳/起身的叠图将拿 standing 的 pairs 检查，可能漏掉新交叉或标错。需要先生成逐姿 pair 集合并按 label/姿态身份匹配，或显式拒绝非 standing；本审查未修改实现。

## 后续准入边界

v4 可以复用现有测量方法，但需要自己的资产 hash、版型/权重回读和逐姿报告。静态失败不能解释为已制作并测试了坐姿辅助骨/shape 控制。新裙接入后应重算当前手层，不能拿旧裙求得的 captured 手姿作为新装备最终接触通过。完整动作、GPU 可见性、连续自然度与成本仍待实际候选验证；本次不扩测、不修改能力状态。
