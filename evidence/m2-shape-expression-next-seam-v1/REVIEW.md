# 形状—表情接缝：下一最小共同机制

2026-11-16；只读研究。requested 配置沿用 gpt-6-astra/high，实际 provider/hook 未独立核验。本包未运行 G、细分、solver、导出或房间；未改源/门槛/4196/封存舞裙。

**建议下一包只验证一次“共同源拓扑的一级线性细分，再传输全部表情端点”**，复用已安装 libigl `upsample_matrix` 和已封 G。它能处理非线性形变被粗直三角近似这一机制，保持原 54 表情的线性消费方式；**尚无证据证明它足以消除当前新增接触，更不是碰撞修复器**。必须同时读回混合次序差；若一级共同细分仍有新增接触，不继续加密、不改权重、不做最坏点/单姿态补丁。当前证据不足以推荐一个“换上就保证通过”的成熟实现。

## 已知缺口，不能混称

本地依据：完整 v2 第 5/6 节要求面部依赖适配与可重复生产，不要求用户雕刻；`scripts/m2-axial-head-evaluation-v1/evaluate.py:13` 已在全部源端点计算 G/J；`scripts/m2-axial-head-export-v1/adapter.py:84` 起已传输作者法线并导出 `P'=G(P), D'_j=G(P+D_j)-G(P)`。这些是有效共同机制，不能因混合失败而说全部形态转移未做。

实际证据见 `evidence/m2-axial-head-export-audit-v1/{REVIEW.md,combination-results.json,oh-new-pair-witness.json}`：lean 55 单态无新增；十混合之一 happy=.65/blink=1/oh=.66 的 Mouth128–Skin1020 新增一对，原同组合 8 对、lean 9 对。round 的单态新增 6 对保留失败。原源 aa/ih/ee/oh 混合已有交叉。交点、barycentric 及微米数不是可见穿透深度；root 的 build14f73cbe1e26 房间结论另记，本报告未借其录像宣布观感通过。

有两种不同近似：

- **空间离散**：只变形三角顶点，输出仍是直三角；通常不等于整片原三角经 G 后的曲面。原连续 J 下界不能约束这种弦面接触。
- **混合次序**：`A(w)=G(P)+Σw_j[G(P+D_j)-G(P)]` 通常不等于 `B(w)=G(P+Σw_jD_j)`。负 EYE_Joy lane 也在该和式内，必须按各材质真实角色计算。增加空间采样不使这个差自动趋零；当前 pair 尚未独立归因给其中一项。

仅对导出后的 A 再线性细分不会改变其几何表面，不能修复原交叉；必须在 **G 之前** 对源 P 和全部 D 使用同一个细分算子。即使改成混合后 G，直三角问题仍存在；把 G 放入 runtime 还会改导出/CPU读回/着色与蒙皮次序合同，本轮不建议未经样件证明就改这条运行链。

## 成熟实现核查与选型

| 实现与来源 | 真正提供的能力、许可及本项目差额 |
|---|---|
| [Sumner–Popović 原作者 Deformation Transfer](https://people.csail.mit.edu/sumner/research/deftransfer/) | 从源三角变换和对应关系求目标变形，可复用线性系统分解。作者页提供论文/视频/数据，本次未核到可直接接入且许可明确的作者 solver；不能把论文可读当代码可用。该机制本身没有给本项目混合/口内接触保证，当前同拓扑且已有 G 时，重新做对应与传移不是最小缺口。 |
| [Blender Corrective Smooth 源码](https://raw.githubusercontent.com/blender/blender/main/source/blender/modifiers/intern/MOD_correctivesmooth.cc) | 官方实现明确为 delta-mush，文件 GPL-2.0-or-later；平滑与局部细节恢复不是 mouth–skin 碰撞约束。即使离线使用，烘焙各单态再混合也不等于逐组合执行非线性 modifier；不能用名称中的 corrective 冒充混合接触解。 |
| [IPC Toolkit](https://github.com/ipc-sim/ipc-toolkit)、[MIT 许可](https://raw.githubusercontent.com/ipc-sim/ipc-toolkit/main/LICENSE) | 有 CollisionMesh、碰撞集合、barrier 能量/导数及 CCD 步长；官方明确不含 physics/solver。要接本项目仍需定义形态目标能量、固定语义、可行初态及求解流程。原源已有交叉，不能把标准无交初态的保证直接套用，也不能随意过滤原 pair 后宣称全域无碰撞。它适合将来明确的接触求解任务，本轮不扩成新求解架构。[原作者论文中的初态/CCD条件](https://ipc-sim.github.io/rigid-ipc/assets/rigid_ipc_paper_350ppi.pdf)也不是本资产已满足的证明。 |
| **已安装 libigl 2.6.3：本轮唯一建议** | 本地 `igl/pyigl_core.pyi:3486` 与[固定 bindings 源码](https://raw.githubusercontent.com/libigl/libigl-python-bindings/1336e57322356b6b7fa66119bccd658c6a127cdf/src/upsample.cpp)一致：`S,NF=igl.upsample_matrix(F,n)`；[固定 core 实现](https://raw.githubusercontent.com/libigl/libigl/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/upsample.cpp)保旧顶点、加入边中点、每三角变四片，文件 MPL-2.0。不是会移动旧点的 Loop/Catmull–Clark 平滑。输入前置为 edge-manifold；已核接口/源码，**本包未调用 smoke**。使用现离线 core，不把其它 GPL 模块许可或二进制分发义务一概称为 MPL。 |

## 一个有界包，先数值候选，不直接八体导出

**输入和共同规则。** 用已封男原源、identity/lean/round 曲线及原 55 状态/十混合权重。一次确定 Face 全部九个消费者的源拓扑分区，在 G 前对每分区用同一 S：`P_s=SP, D_sj=SD_j`，再用原端点 G/J 与导出语义。对材质/UV/法线接缝保原索引身份，不按坐标焊点；不只细分 Mouth128/Skin1020 或某个最坏姿态。源 ID→新增边点→原 parent triangle 可追踪。相同源/分区在其它请求复用 S；女源另做同规则前置，不借男通过。

**先解决可消费性前置。** edge-manifold、共享消费者、所有 54 targets、UV/作者 N、骨权与 fixed 语义覆盖须完整。旧顶点和 skin/IBM/表达映射保持；新点插值 UV/作者 N，并按骨 ID 合并插值权重，不能平均 JOINTS 数字，不能静默截断超过运行格式支持的 influence 数。一般 `LBS(SP,Sweights) != S(LBS(P,weights))`，新增点蒙皮不是自动精确保形，需检查实际骨姿。Face/Body 或材质分界若新曲边与未细分邻面产生裂缝，不能跳过；前置不成立即停，不临时焊缝补丁。此阶段不导出。

**唯一一次机制判别。** 只用一级 S，保留 N0 原结果与 N1 数组。对同批状态同时记录 A（实际可导出端点混合）、B（源先按真实 lane 混合再 G，仅归因对照）以及同拓扑原源基线；不能因 B 好而宣布 A 或真实 manager 好。比较全部口内–skin 与既有眼部接触，不只已知 pair。N1 新三角必须同时保 parent provenance 和子片交点：旧 strict 阈值原样运行，原 parent 基线/失败不重标；若交点落新增边导致 strict margin 或子片 ID 改变而计数消失，要保留为未决边界，不能把“细分后零计数”当修复。需要独立核查已知 witness 的几何位置与边界分类。

**准入与停止。** 原 101 实际切片≤2mm/无缺片、fixed≤2µm、G 的 J>.12、原 55/十混合无新增接触、原作者 N/54 语义及新增拓扑身份仍逐项验。首次最多 identity+两男样，不调整 G、细分级数、权重或 contact epsilon。若 A 仍失败、只是子片漏检、identity/绑定不成立或一级代价不适用，即封存这条尝试；A/B 的差异只用于定位，不能按某个权重临时切换公式。若通过，也仅证明这些数值样件，再沿既有导出器和同房间真实 manager/正常 1×链验收；三角约四倍、morph 数据增长和普通电脑成本须实测。

这条路线的工程价值是一次检验并可能移除“源表面采样太粗”这一共同机制，同时不先改变 VRM 表情接口。**它不承诺任意表情权重、所有骨姿或八预设自动无碰撞；若新增接触主要来自非交换项，本方案不能替代后续共同合成机制。** 当前研究到此结束，不继续列工具或申请多轮参数试验。
