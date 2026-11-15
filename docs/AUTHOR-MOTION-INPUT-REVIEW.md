# 原生布料作者试验：输入、时间与自碰约定独立核查

结论：目前未确认坐入失败来自坐标倍率、时间错位、形态键叠加或 pin 不更新。确认源厚边与自碰间距约定不一致：作者参数 `.005` 经 scale 10 换算后，不是“两面只需相隔 0.5mm”，Blender 4.5.9 实际检测两面约 1mm 内的接近，并以约 0.888889mm 为响应间距。源内折名义 0.8mm；实际初值有 240 对不共享顶点的外/内层面距离不足 1mm，局部约 0.618mm。它们已进入检测范围，但没有原生冲量证据，不能将这一不一致直接宣布为全部失败的根因。

本次仅阅读源及已有数据、离线重算 LBS 和相邻输入位移。没有启动 Blender、浏览器、重跑物理、调参或改制作源。数字回执：`evidence/author-motion-input-review.json`。

## 固定身份与范围

- 工作树：`experiments/m1-simple-skirt-worktree`。
- 原试验：`scripts/m1-assets/simple-skirt/trial-author-cloth-v1.py`，SHA256 `ddd5ea2793e6e80de2b3dd23b014c3e57b5592770e5b55d9855bfb35fa256be2`。
- 最新包装：`scripts/m1-assets/simple-skirt/trial-two-quad-diagnostic-v1.py`；它核验原脚本哈希，只更换源身份、面映射和“交叉永久拒绝但继续观察”的诊断策略，没有改变物理参数。结构门仍立即停止。
- 最新源：`assets-source/m1/simple-skirt-v1/two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb`，SHA256 `02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7`。
- 输入：同目录树 `active-gap-hem-v1/continuous-input-v1/capture.json.gz`，SHA256 `e494fa798bd954554b430635f43d4aa4417d346aac6391511c08502daebc6d58`，实际私有骨调色板固定构建 `58394ce674e4`。
- 结果：`two-quad-thirds-v1/native-author-trial-v1/result.json`；第 7 帧首次交叉，第 18 帧结构伸长门终止。没有把继续诊断的后续帧记为通过。

## 已确认：坐标、时间、形态键和 pin

1. **坐标变换互逆，重力倍率一致。** 源 `(x,y,z)` 映射为 Blender `10×(x,-z,y)`，回读严格逆变换。模型尺度增大 10 倍、时间不变时，重力加速度也乘 10，换回游戏米单位仍是 9.81m/s²。没有发现仅放大几何、遗漏重力倍率的问题。
2. **时间没有倒退或重采错帧。** `capture-author-input-v1.cjs` 先复制三份同一站姿，然后每次 `advance(1/30)` 捕获一个实际状态。前 3 帧 pin/body/top 数组的相邻位移都为 0；第 4–18 帧 simulationTime 每次增加 1/30 秒（浮点误差量级）。第 18 帧 actionSeconds=0.5，作者 simulationSeconds=17/30；差值是前两段静止准备时间。`modeTime` 比 actionSeconds 少一个 1/120 秒子步；这是已记录的状态字段差异，本次未进一步追溯其首子步重置。裙、身体和上衣仍由同一次 take() 同步读取，未发现它们相互错帧。
3. **相对形态键没有累加整份形状。** `animate()` 为每个样本保存相对于同一个 Basis 的差值，键权重为相邻帧的三角脉冲，fcurve 全部 LINEAR。整数帧只有对应样本权重 1；在 n 与 n+1 之间，输出为 `(1-t)P[n]+tP[n+1]`。首段 Basis 权重隐含补足。不存在多份完整坐标相加的问题。
4. **自由裙点没有第二套动画驱动。** `targets` 只将 `fixed` 顶点替换为该帧 LBS，其他顶点一直等于第一帧位置。身体/上衣碰撞体各自用同帧完整捕获数组。pin 集合来自前 260 面的实际焊接索引，不是错误地固定全部下摆。
5. **冻结 rest 不等于冻结 pin。** Blender 4.5.9 的 `cloth.cc` 268–298 行先从当前输入网格更新 `xconst`；`use_dynamic_mesh` 另行控制基准网格/弹簧长度更新。此处 `False` 正是固定材料 rest、继续更新目标 pin。已有 18 帧最大实际 pin 残差为 **0.115464µm**，不支持“pin 停留站姿”的解释。[官方实现](https://github.com/blender/blender/blob/v4.5.9/source/blender/blenkernel/intern/cloth.cc#L268)

输入本身是分段线性、位置连续的 30Hz 采样，不保证速度连续，也不等价于运行时每个 120Hz 子步的曲线。本次未求 Blender 亚帧输入对真实 120Hz 数据的误差，不能凭此声称连续碰撞已验证。现有相邻位移：站姿→首坐入 pin 最大 3.149894mm、全身体最大 37.210398mm；前 18 帧 pin 最大单步 15.737328mm，全身体最大单步 44.802112mm。全身体最大值包含手等远端区域，不能当成裙腰或某个相交面的速度。没有根据这些值单独认定动作跳变。

## 已确认：物性值不是成衣标定

`mass=.15` 是每顶点质量参数，不是整件裙总质量；最新焊接网格 1290 点的名义赋值总和是 193.5。该数字属于 scale10 的数值作者域，**不是“真实裙重 193.5kg”**。加点还会改变名义总质量/弹簧网络，不能假定不同拓扑在未校准时具有完全相同材料行为。[官方 RNA 字段定义](https://github.com/blender/blender/blob/v4.5.9/source/blender/makesrna/intern/rna_cloth.cc#L615)

张力/压缩/剪切 `15/15/8`、角弯曲 `.6`、空气阻尼 `2` 均是未与真实布料对应校准的作者参数。几何和重力倍率正确，不足以证明弯曲、空气及碰撞响应也满足物理相似。现有证据不能将任一值直接判为第 7/18 帧失败的原因；本报告不建议扫参数或扩大下沉/伸长阈值。

## 自碰间距：明确的待区分约定

[Blender 4.5.9 collision.cc](https://github.com/blender/blender/blob/v4.5.9/source/blender/blenkernel/intern/collision.cc) 的 `cloth_selfcollision()`（1111 行）比较约 `2×selfepsilon`；`cloth_selfcollision_response_static()`（799 行）使用 `2×selfepsilon×8/9`。本地 `.005` 除 scale10 后分别是 **1mm** 和 **0.888889mm**。原文哈希/摘录已保存在 `evidence/blender-459-self-collision-reference.json`。

不是所有近面都参与：1031–1070 行排除共享顶点、缝合边连接、整面排除自碰，以及双方整面固定的配对；并非排除任意在拓扑上相近但不共享顶点的面。检测还要求有效方向，响应取决于相对运动等分支。因此，仅比较 0.8 与 0.888889 不能推出“这一帧已经发生某个冲量”。应对实际焊接后的外层/内折非邻接面核距离和条件，不能把合法共享接缝算成错误，也不能只看 zero-intersection 门推定没有自碰预载。

## 一个最小区分实验（本次未执行）

先用既有第 1–18 帧与冻结拓扑，针对实际外/内折近面记录共享索引排除、有限面最近点距离和父面 ID，建立是否存在初始自碰预载的确定证据；不调整任何间距。

若确认存在非邻接厚边预载，下一次仅做**一次冻结同样站姿输入的 18 帧诊断对照**：源、质量/刚度、质量步数、碰撞距离、pin、门和自碰开关全部保留，只将动态输入帧替换为第 1 帧。与已保存的运动试验比较同一内折边的伸长/自碰响应开始时刻。若静止也同样异常，运动 pin 不是必要条件；若只在动态异常，继续研究实际接触/输入运动耦合，不能因此宣称间距合理。该对照是根因实验，不是产品验收，也不将冻结动作当作坐姿修复。

若后续单独怀疑形态键求值，应先在关闭 Cloth **求值**的副本读取帧 3、3.5、4 的碰撞体和 pin，和线性期望逐点比较；这是输入诊断，可在运行物理前完成，不应用修改动作或阈值代替检查。

## 实际厚边证据补充

prototype 的只读 `two-quad-thirds-v1/native-author-trial-v1/hem-self-clearance.json` 确认初始帧有 240 对无共享 sim 顶点的内折/外层面距离小于 1mm，最长伸长边邻域有 6 对。例：inner2359（parent2339，sim[1119,1240,1239]）与 outer2118（parent2098，sim[999,1000,1120]）距离 0.617637650mm；另一对2361/2120距离0.611306959mm。局部端点距外层约0.8025/0.8023mm。第18帧同局部最小非邻接间距5.089674mm。可以确认源初始层距进入检测范围、低于响应间距，不能把零交叉初值理解为无自碰预载；仍未记录原生冲量，不能断言它主导了拉伸失败。

## 可复跑入口

运行 `python scripts/audit-author-motion-input.py`，或以 `--worktree <恢复的 codex/simple-skirt-v1 工作树>` 指定输入。脚本核源GLB、捕获包、原试验SHA，只提取已有GLB accessor读取函数并做NumPy LBS/位移计算，不导入bpy、不执行作者试验。默认写上述 evidence JSON，`--output` 可另存。它需要原60帧capture及最新18帧result/preparation，不从运行中的游戏采样。

脚本已实际执行，重建报告逐字节一致；SHA256 `9667e68486ad26f2c7bd8c7fcca99df3b84d7f5a32107b948a929df37b6f2d08`。静止诊断交由 prototype 串行执行，本次审查没有启动该实验。

## 补充：固定带不要求全局 object 碰撞距离必须小于 0.339mm

以下是 Blender 4.5.9 的实际路径，不是对历史参数选择动机的推断。

- `collision.cc` 941–955 行的 `cloth_bvh_collision_is_active()` 对三点 flags 做按位 AND：**整面三点全部 pinned**，或者三点全部 NOOBJCOLL，才跳过该面的 object collision。固定带前 260 面的三点均在 pin 集合，因此这些整面已被原生物理排除；不存在必须缩小全局距离才能避免求解推动该整面的问题。
- **只固定一个或两个点的过渡面仍参与检测。** `cloth_collision_response_static()` 642–787 行会按接触重心权重生成顶点冲量；`cloth_collision_impulse_vert()` 本身不检查 PINNED。不能把这一步描述成“混合面上的所有冲量都被忽略”。
- 之后 [SIM_mass_spring.cc](https://github.com/blender/blender/blob/v4.5.9/source/blender/simulation/intern/SIM_mass_spring.cc) 1202–1209 行在应用碰撞速度修正时跳过 pinned 顶点；262–264 行将其设为零自由度约束，1283–1292 行按输入给定速度，1331–1340 行在子步设置插值后的指定位置。因此混合面的固定点不会被碰撞自由推走，自由点仍受响应；不能保证该部分响应与约束边界没有应力集中，也不能认为“整张过渡面不参与”。
- object 窄相在 `collision.cc` 989 行使用 cloth epsilon 加 collider BVH epsilon；此试验真实作者值 `.002+.001` 对应游戏 **0.3mm**，响应目标（654 行）约为 **0.266667mm**。它与作者门的“活动源初值 2mm”是不同概念；源余量不是 solver 默认厚度。

`AUTHORING-TRIAL-SPEC.md` 23 行明说沿用已有原生试验参数，并记录 fixed zipper 的 0.338647mm 高于 0.3mm。文档支持“曾核对兼容性”，不支持“因 fixed 距离而被迫选择该值”的历史结论。代码也没有这种必然性：整固定面原已不参与 object 推离；其与人体的实际交叉仍是作者制作问题。

可以在结构方案中保留上述原生固定带求解边界，同时完整保留最后的几何验收。现脚本 94 行 `tree(p,faces)` 使用**全部**裙面，和全 body/top/chair 做交叉；100–101 行没有对固定面过滤，pin 残差也另行检查。所以“物理不推动固定带”和“固定带交叉照样失败”当前已经分离。无需删除面、隐藏身体或缩减最终门来实现这个区分。

这只排除了“为迁就整固定带必须维持极小全局距离”的逻辑必然性，**不是增大距离的准入结论**。临界混合面仍被检测，动态 pin 的实际轨迹、自由区身体/上衣夹层、相对速度及自碰厚边约定仍须独立检验。增距可能在 pin 边界或上衣夹层增加冲突；不能据当前静态活动域 2mm 余量声称能解决 row2 动态穿过。本次没有修改距离或实现排除组。

## 后续授权的固定输入 60 帧检查

`scripts/audit-skirt-fixed-band-continuous.py` 已在 Blender 4.5.9 后台执行，只有 GLB/LBS/BVH 几何计算，未创建场景对象、运行 Cloth 或改源。输出为 `evidence/skirt-fixed-band-continuous.json`。

029 源面 0–259 的三点逐面核实全部属于实际 pin 集合。原 capture 的 **60 帧**中，这 260 个固定面与完整 body、两上衣 primitive、椅座和椅背的有限三角交叉均为 **0 对**。没有在这些采样点发现“固定输入已交叉而要求自由布料修复”的不可解条件。

在执行该门之前，原 layer1 GLB 经同一实际 private palette 回放与首帧及旧四姿实际捕获的位置误差最大为 0.362400µm；029 首帧与已保存 native 首帧回读最大差 0.112919µm；旧四姿逐表面的固定面 pair 与冻结 geometry-gate 完全相同。没有使用旧 raw helper 矩阵代替 private palette，也没有要求改造后的029几何等于原layer1捕获几何。

此结果只覆盖 30Hz 的 60 个实际输入样本，不证明帧间无交叉、不检测整片完全包入人体却不穿过表面的体积情况，也不证明自由裙面能稳定响应。运行方式：`blender --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/audit-skirt-fixed-band-continuous.py`；恢复后的源工作树可通过 `-- --worktree PATH` 指定。
