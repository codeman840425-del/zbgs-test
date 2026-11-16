# 八预设形状生产方法的约束与替代选项

研究日期为 2026-11-16。本轮只读当前 v2 源码、固定产物、失败记录和游戏截图，并查询两种已有实现。没有修改源、参数、生成资源或 runtime，没有启动 Blender、GPU、浏览器或安装求解库。下文的局部数值复算仅在内存中执行，未重导出任何人物。

## 结论与建议

当前瓶颈是**形状参数如何映射为连续、可实现且保留特征的几何约束**。现有场的平滑函数、固定脸曲线和逐顶点 Jacobian 检查分别解决局部问题，还没有形成能覆盖八组请求的共同形状模型。六项 source-passed 只证明现有源门通过，脸型请求仍有显著损失。两项 lean 的失败必须保留，其中女性是严重局部压缩，男性已经出现局部反向。

建议下一次只做 **Blender Mesh Deform cage 与 Surface Deform 衣物绑定的单次离线批次对照**，使用同一套语义 cage 模板和参数到目标点规则，保留八套请求，显式测量实际结果与目标差。它的优势是可以直接复用成熟、可编辑的形状及衣物绑定实现，避免继续追加手写分区位移函数。它没有提供可逆性或防穿保证，现有折叠拒绝、表达和衣物接触检查仍需保留。libigl SLIM 是第二个有真实代码的选项，更适合专门研究防局部翻转，但其体积网格、特征约束和 VRM 接口准备成本较高，本轮不建议同时实现两条路线。

## 当前输入与证据身份

| 本轮核读文件 | SHA256 |
| --- | --- |
| `scripts/m2-representative-batch-v2/deform.py` | `9eaede97e6d4c6cb5d95259f4a009a80ecd1980f387f7ddd325dc5486cc2e8d2` |
| `assets-source/m2-representative-batch-v2/spec.json` | `2b7136daad4626a768b8781328f5aebe628f61b4ba6fd0870624544378f5b669` |
| `assets-source/m2-representative-batch-v2/generated/manifest.json` | `de63a8d05a03b5af67cd20a9f36ecf4c0edad60cc9e7e1fc160fca382b7a32c5` |
| `evidence/m2-representative-vest-specks-68a-v1/root-attribution.json` | `d0bfd6de21b891dcf7df8332b8ff8ed4647f539164d6d8888b1eaf26cdb30f99` |

原女 Body SHA256 为 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，原男为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。八套数值及各自 top/bottom/shoes 输入身份见上述 spec。当前六个 source-passed 与两个 FAILED 的范围保持。

已直接查看以下原尺寸游戏证据。它们属于 source `07299e9f`、build `68a82cfef469`，本轮没有重录。

- `evidence/m2-representative-six-room-68a-v1/female-round-full-v2/face-front-stage.png`。可见颊至下颌的折段和尖颏，表面颜色与轮廓问题同时存在，单图不能证明具体导数原因。
- `evidence/m2-representative-six-room-68a-v1/male-round-stocky-v2/face-side-stage.png`。可见下唇至颏部较陡的轮廓变化。
- `evidence/m2-representative-vest-specks-68a-v1/female-round-full-v2-restored.png` 与 `female-round-full-v2-top.png`。前者有腹前两个青色小斑，后者移除上衣后可见高腰裤。结合已保存同姿切层记录，只能确认可见斑点来自裤层。

## 已确认的共同方法限制

### 1. 平滑位移不等于局部可逆

当前 `Mapper.field()` 保留 v1 的肩、上臂、大腿项，加上连续混合的躯干宽深位移和脸部场。`group()` 用每轴正负 10 微米的有限差分求 Jacobian，保护点另设单位矩阵，再拒绝 `det <= 0.12`。这检查的是所测顶点/端点附近的局部导数，不能据此证明所有三角内部、保护过渡或完整空间映射均可逆，也不能证明没有全局自交。强制保护点回原位和把该点 J 设为单位矩阵，还需与邻接可变点一起检查。

本轮在 FAILED 中的精确源位置复算，重现原数值。坐标均为米。

| 失败项 | 精确失败位置及局部证据 | 可作出的判断 |
| --- | --- | --- |
| female-long-slender-v2，vertex 702 | `[-0.0094194701,1.3438979387,-0.0194358397]`，head-local Y `-0.043663502`，face_lo `-0.033162250`。J 的主对角约 `[1,0.102261582,1]`，`Jzy=-0.224434605`，det `0.102261582`，最小奇异值约 `0.099755425` | 比例已被压得过小，尚不能把该点称作负行列式翻转 |
| male-long-lean-v2，vertex 913 | `[0.0465075187,1.5235670805,-0.0335550569]`，`Jxx=-1.454325105`、`Jxy=2.485097485`、`Jyy=1.106913243`，det `-1.609811718` | 确认实际局部方向反转 |

女性位置处在 face_lo 下方约 10.501 毫米，落入 `region=smooth((y-(face_lo-.02))/.02)` 的 20 毫米下界过渡。该处下颏纵向位移约 -5.549 毫米。只在内存里将 chinLength 项设为零作导数分解时，det 回到约 1，其他项保持。证据支持下颏位移与下界过渡的导数造成压缩，不能把它归为女衣 UV 或 donor 失败。本次没有把这个诊断改值作为新参数或修法。

男性失败点的源半宽为 46.074 毫米，约束曲线半宽为 31.132 毫米，差值为 -14.942 毫米。该点 lip 权重约 0.951，唇保护横向 anchor 为 31.880 毫米。代码用 `lateral(x)/lateral(sourceHalfWidth)` 把固定唇外的剩余区间压缩到曲线目标，局部收缩导数已经超过可用宽度。只移除 chinLength 后 det 仍约 -1.454325，说明它与女性的纵向下界问题不同。共同问题在于固定特征、请求位移和有限空间之间缺少联合可行性控制。

### 2. 单一全域凹曲线容纳不了当前脸型意图

`face_curve()` 用 101 个截面半宽构造 12 控制点的三次 B-spline，要求整段一阶导数非负、二阶导数非正。下端固定源半宽，上端固定源半宽和源斜率，再最小化请求残差与曲率项。该数值求解具有明确可行族，却把圆颊、方下颌和收颏都限制为同一种由下向上增宽的凹轮廓。

下端截面来自最底顶点以上 0.01 毫米处，女半宽约 0.073 毫米、男约 0.125 毫米，并被固定。保持这个接近尖点的下端，再要求整段凹和固定眼下端斜率，会保留尖颏倾向，也限制了中段增宽。当前代码的半宽曲线只处理一个投影轮廓，侧面颏投影和保护区仍由别的位移项控制。

| 预设 | 最大请求半宽损失 mm | 最大损失位置的请求半宽 mm | 曲线实际半宽 mm |
| --- | ---: | ---: | ---: |
| female-round-full-v2 | 24.952 | 93.231 | 68.279 |
| female-soft-wide-v2 | 27.164 | 95.443 | 68.279 |
| female-square-athletic-v2 | 16.130 | 83.804 | 67.674 |
| male-wide-muscular-v2 | 24.441 | 92.940 | 68.498 |
| male-round-stocky-v2 | 31.058 | 100.070 | 69.012 |
| male-angular-athletic-v2 | 8.668 | 76.653 | 67.984 |

这些数值来自六个固定 `build-report.json` 的 `faceCurve` 数组。丰满女与宽女的不同请求几乎得到同一曲线，这已经确认参数意图被共同可行族明显投影掉。截图中的尖角还可能受到原拓扑稀疏、分区过渡和 outline 的影响，本轮没有把所有可见折段归为单一数值原因。连续曲线本身也不能增加原网格的几何分辨率。

### 3. 原世界坐标余量保持不足以证明衣物层次

`Source.bind()` 将每件衣物的顶点绑定到不可变原 Body 三角及 barycentric 坐标。`transfer()` 只把 donor Body 的位移插值加到原衣物点，原 `offset=P-anchor` 作为世界向量保持。这样避免了 v1 直接缩放服装余量，但不会随新表面旋转余量方向，也没有建立 top 相对 pants 的最小间距或遮挡约束。

当前 `sourceOffsetPreservationMaxErrorM` 检查的是 `mapped-(anchor+displacement)-offset`。依照赋值 `mapped=P+displacement`，这个量主要验证算术一致性，不能替代衣物法向厚度、相邻 donor 过渡、不同蒙皮权重下的层间间距测量。当前 normals 用的是实际 donor-transfer Jacobian 的逆转置，方向处理有依据，仍不能修正几何层次。

68a 的小斑已有明确裤层来源，但“裤面确实穿出上衣”“上衣 coverage/index 删除”“透明材质/alpha 导致可见”等具体机制尚未由本轮几何数据区分。下一方法必须保留这个缺口，不自动以新 coverage 隐藏它。

## 仅比较两种已有实现

| 项目 | Blender cage 与 Surface Deform | libigl SLIM 体积形变 |
| --- | --- | --- |
| 已核源码身份 | Blender HEAD `e38faeb16cf5126b3eb1cfab82ee4e87b776278c` 的 Mesh/Surface Deform C++ 实现 | libigl HEAD `b41f1944a703653ae0da81e6588650ba14c270ea` 的 `slim.h/.cpp`、防翻转 line search 与 709 示例 |
| 实际输入 | 封闭 cage、被变形网格、bind 状态，衣物可绑定目标表面 | 顶点、三角/四面体连接、有效初始映射、目标点索引/位置、能量与软约束权重 |
| 可直接复用 | cage 绑定、变形求值、可编辑 blend、Surface Deform 的表面与法向余量绑定 | 重加权局部/全局求解与避免到达局部奇异点的 line search |
| 仍需本项目制作 | 共同语义 cage、参数到目标点的定义、protected features、逐 morph 导出及 GLB 身份读回 | 有效体积网格、特征点约束及嵌入、所有网格/端点的体积坐标、VRM 导出 |
| 可逆性 | 未提供 det 下界或全局无交保证，cage 可折叠 | 从有效映射出发维护局部不翻转的路径，仍不等于全局无重叠、固定 `det>.12` 或精确满足目标 |
| 直接衣物仿真 | 无，Surface Deform 传递形变 | 无，映射传递不能替代布料/层间碰撞 |
| Windows 与运行 | 官方 Windows 离线 Blender，可后台 Python，不需训练 | 官方 CI 有 Windows/MSVC，C++/Eigen，可离线 CPU，无训练 |

### 选项一，Blender 的成熟绑定工具

`Mesh Deform` 接受封闭 cage，绑定后用 cage 控制原网格，提供 precision、vertex group 和 Dynamic 选项。文档明确提醒绑定可能慢、耗内存，较大的 cage 变化会产生伪影。它保留拓扑，但文档和源码没有承诺局部 Jacobian 正值，因此不能把换成 cage 当作两项 lean 必然成功的证明。[Mesh Deform 手册](https://docs.blender.org/manual/en/3.6/modeling/modifiers/deform/mesh_deform.html)、[固定源码](https://github.com/blender/blender/blob/e38faeb16cf5126b3eb1cfab82ee4e87b776278c/source/blender/modifiers/intern/MOD_meshdeform.cc)

`Surface Deform` 的源码保存绑定多边形/三角权重与 `normal_dist`，求值时计算当前表面点，再沿当前目标法线加保存的距离。这比现有固定世界 offset 有明确不同的几何含义。它使用邻近表面加权，不只是本项目单一最近三角的平移。但目标不得有非流形多面边、重叠顶点、退化边等情况，离目标表面越远越容易失真。原 Body 的材质接缝/重复顶点必须先核对，不能直接承诺整身可 bind，也不能静默焊接输出人物。[Surface Deform 手册](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/surface_deform.html)、[固定源码中的绑定及法向余量求值](https://github.com/blender/blender/blob/e38faeb16cf5126b3eb1cfab82ee4e87b776278c/source/blender/modifiers/intern/MOD_surfacedeform.cc)

形变类 modifier 保持拓扑，但不会自动证明原 VRM skin、IBM、表达和自定义 normals 在导出后正确。须以同一源 cage/绑定规则求 base 和各表达端点，生成 `G(P+D)-G(P)`，再保存原节点/权重/UV/材质。存在 shape keys 时不能假设一次 Apply 或一次 glTF 导出就完成这个闭环。Dynamic 对 shape keys 的求值和绑定模式需以一个实际端点预检，导出 normals 应依据实际新表面与平滑分组重算，或使用已验证的实际变换，不能套原场 J。[modifier 类型与 shape-key 操作说明](https://docs.blender.org/manual/en/latest/modeling/modifiers/introduction.html)、[Mesh Deform 源码](https://github.com/blender/blender/blob/e38faeb16cf5126b3eb1cfab82ee4e87b776278c/source/blender/modifiers/intern/MOD_meshdeform.cc)

两项 modifier 源文件的 SPDX 为 GPL-2.0-or-later。Blender 官方许可页说明作品及其输出数据可按创作者意愿使用，原角色和贴图的许可仍需保留。将 Blender 当离线工具与把其代码移植到产品是不同的分发情形，后者需单独核许可证义务。官方有 Windows 发行包和命令行后台运行方式，本轮未安装或运行。[官方许可](https://www.blender.org/about/license/)、[Windows 发行](https://www.blender.org/releases/4-5/)、[命令行文档](https://docs.blender.org/manual/en/4.5/advanced/command_line/index.html)

### 选项二，libigl SLIM 的防局部翻转求解

SLIM 是有原始论文和公开实现的局部可注入映射方法。已核 `slim_precompute(V,F,V_init,data,energy,b,bc,soft_p)` 与 `slim_solve(data,iterations)`，F 可为三角或四面体。709 示例的第三种模式实际执行三维形变。内部求解后调用 `flip_avoiding_line_search()`，沿当前到候选的步长求奇异点，并用小于该位置的步长继续优化。可以直接复用这些实现，避免再手写一个“平滑后检查”的求解器。[官方教程](https://libigl.github.io/tutorial/#scalable-locally-injective-maps)、[原作者论文](https://roipo.github.io/publication/2017-rabinovich-scalable/SLIM.pdf)、[固定示例](https://github.com/libigl/libigl/blob/b41f1944a703653ae0da81e6588650ba14c270ea/tutorial/709_SLIM/main.cpp)、[实际 line search](https://github.com/libigl/libigl/blob/b41f1944a703653ae0da81e6588650ba14c270ea/include/igl/flip_avoiding_line_search.cpp)

该 API 的 b/bc 在本实现中由 `soft_const_p` 加入惩罚项，不能只因参数名叫 fixed 就宣称硬满足原请求。有效初始四面体映射、防翻转和全局无自交也有不同要求。它没有 VRM、骨架、蒙皮、shape-key 或衣物装配接口，更没有自然脸型目标。即使每个 tet 不翻转，原脸部全域凹曲线或不相容的唇保护要求仍可能产生大残差。若将原请求不变地送入另一套软优化，必须再次报告实际意图损失。[SLIMData/API](https://github.com/libigl/libigl/blob/b41f1944a703653ae0da81e6588650ba14c270ea/include/igl/slim.h)、[软约束与求解代码](https://github.com/libigl/libigl/blob/b41f1944a703653ae0da81e6588650ba14c270ea/include/igl/slim.cpp)

SLIM 源文件和相应代码使用 MPL-2.0，需保留通知并按该许可处理分发的覆盖源码修改。libigl 的不同可选模块和外部四面体网格生成器仍需分别核验许可，不能用根许可覆盖全部依赖。官方 CI 有 Windows 2022/MSVC 构建，核心以 Eigen 为基础，无模型权重/训练需求。本轮未编译，Python binding 是否覆盖所需三维 API 也未验证，不能把现有 Python producer 视为可直接调用。[MPL-2.0 文件](https://github.com/libigl/libigl/blob/b41f1944a703653ae0da81e6588650ba14c270ea/LICENSE.MPL2)、[Windows CI](https://github.com/libigl/libigl/blob/b41f1944a703653ae0da81e6588650ba14c270ea/.github/workflows/continuous.yml)

## 建议的单次替代实验

该建议等待 root 审阅后实施。范围是现有八个请求的共同离线生产比较，继续保原 v1、v2、两 FAILED 和全部原素材。研究阶段没有新产物或新可用身份。

1. 固定原男女 VRM、六件独立装备、八组原参数和精确 SHA。建立一套由实际解剖 landmark 定义的 cage 语义模板，男女仅按各自真实源几何建立 rest cage 与 bind。八项使用同一目标点计算规则，禁止逐项手雕或缩小强度。脸部把 jaw/cheek/chin 作为分区目标和保护特征，先声明目标截面、颏长度/投影与原参数的对应，避免再次默认整段只能是同一凹曲线。
   实施前另固定实际 Blender 二进制版本、SHA、Python/API 和导出器版本。上文固定的是观察到的源码提交，不能把它直接当作某个已安装 LTS 二进制的构建身份。
2. 先核单位、源顶点/索引身份及 identity cage 求值，同时检查封闭 cage、所有待变形点和表达端点的覆盖。Surface Deform 的 donor 如需清理接缝，保留独立代理及源点对应，原网格和输出拓扑保持。遇到无法保对应的目标，记录前置失败，不自动重拓扑。
3. 每性别用一个 rest bind 生成其四个目标。对衣物采用已核 Surface Deform 的法向余量语义，记录每个绑点、原距离和实际新距离。上衣与裤子仍需测实际层间间距，不能由两者都绑定 Body 推定无穿。保原 garment 版型和材料，禁止加 coverage 来消失当前绿斑。
4. 使用同一规则求值 base、全部实际表达端点，并保 UV、JOINTS/WEIGHTS、节点/IBM、表达绑定、图片原字节。结果与源逐属性核验，normals 按实际导出表面核。表达混合仍是额外验证范围，不能以单端点全过概括所有混合。
5. 保留八套 requested 数值，输出每项 achieved 的截面宽/深、颏位置和保护边界误差，单位毫米，同时记录轮廓切线和曲率、局部最小比例/det、实际自交及服装层间距离。原 `det>.12` 门不降低。若映射模式不能定义可比较的空间 Jacobian，明确记验证缺口，不能用“cage 看起来平滑”代替通过。
6. 批次生成一次，输出同源同镜头正/侧/背全身与脸部近景，显示 identity 原型和请求尺寸参考。逐项保成功、部分实现或失败，不能把八项请求改成只有通过项。记录准备/bind/导出时间、资源字节和单项修改数，统一交给 root 做源审读及后续实际动作验证。

预算为一个共同模板、一个固定绑定/求值配置、一次八项批次。只允许一次有明确证据的共同接入错误修复，例如单位或导出索引错误。形状不可行、保护冲突、绑定失败和仍有尖角/穿插应作为方法结果保留，不能靠多轮 precision/半径搜索、阈值放宽、改名或逐体补丁变成通过。若多数请求仍严重丢失，停止此实验，回到目标形状表达与源拓扑适用性评估，不同时启动 SLIM 或新引擎。

本次建议选择 Blender 是基于现成可编辑生产工具和明确的表面绑定实现。尚无证据证明它能完成这八套实际请求，SLIM 也没有在本项目求解成功。当前结论支持一次受限方法对照，不替代八预设的源、游戏动作和人类观看验收。
