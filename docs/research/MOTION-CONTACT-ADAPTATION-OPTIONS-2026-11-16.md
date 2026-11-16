# 几何与接触感知动作适配代码选项

研究日期为 2026-11-16。本次只核读本地调用链、作者论文、公开仓库源码和许可。未安装依赖、下载模型权重、运行推理、训练或求解，也没有修改人物、衣物和动作资源。

## 选型判断

建议将 **Mink 作为下一次有界离线约束 IK 对照的优先代码候选**。它具备可核验的关节、速度、碰撞距离和接触任务接口，无需训练，但必须制作 VRM 到 MJCF 的坐标与关节适配，并在求解后用真实蒙皮身体和衣物复核。**R2ET 适合作为学习式重定向对照候选**，前提是先证明旧 CUDA 环境和 22 关节输入转换可运行。它的公开推理入口使用身体尺寸描述，细节衣物接触仍需额外验证。**Contact-Aware Retargeting of Skinned Motion 当前适合作为方法参考**，本轮尚未找到能核验许可、权重和入口的官方代码包。

| 候选 | 已核验的可执行基础 | 几何与接触输入 | 主要接入缺口 |
| --- | --- | --- | --- |
| R2ET，CVPR 2023 | Python 推理脚本、随仓预训练权重、配置、统计量和 CUDA 扩展源码 | 固定 22 关节，源/目标 BVH，以及形状 NPZ 中的每关节尺寸描述 | VRM/BVH 转换、形状预处理、旧 CUDA 环境和真实衣物接触复核 |
| Contact-Aware Retargeting of Skinned Motion，ICCV 2021 | 作者论文、项目页和演示 | 论文使用动作、源/目标骨架、静止网格和蒙皮权重，识别自接触和脚接触 | 官方代码、模型权重、软件许可及实际推理入口本轮未核验 |
| Mink | Python/MuJoCo 的实际 QP 求解器、碰撞限制和人形示例 | MJCF 关节树、任务坐标架、碰撞 geom、关节/速度界限、显式接触任务 | 无 VRM/skinning 导入，geom 代理与真实蒙皮/衣物之间存在误差 |

表中实现状态来自下文逐项代码核读。三者在本项目原男女、派生体型和独立衣物上的实际结果均待实验。

## 本项目当前接缝

本轮本地核读时主仓 HEAD 为 `4becd55ac98475c7a5a0e8f506dfa0ae0459063d`。下列文件 SHA256 与现有 `evidence/dance-contact-adaptation-feasibility-2026-11-16.json` 一致，可用来确定研究所依据的运行版本。

| 文件 | SHA256 |
| --- | --- |
| `prototype/src/motion-source.js` | `28b9e21ca91a6aab72b78815e6c19d004b58ab7a019b57a699f7d510738af3ef` |
| `prototype/src/normalized-motion.js` | `fd0c05c6542b5a177dbbad0bd4d8a1991e7663c3006a1565a21ed2476bdaa81e` |
| `prototype/src/motion.js` | `22cf4adaa1b5cb0839150c1e6ce00cd33b895c28f737b6b60343081ee34308fb` |
| `prototype/src/foundation-avatar.js` | `b3634ccbe0c8cba31634e3357ddc4d31281d08c85ffdf101bdd1c398febeba83` |
| `prototype/public/assets/motion/m1c/dance-imports.json` | `6d24632e2839937fa5741228a145d0ebb490d55cd2817ffdd15d0d666e06c4f2` |

`motion-source.js` 已有普通 GLB 重定向和精确 avatar SHA 对应的 `normalized-vrm-motion.1` 读取分支。后者核文件 SHA、字节数和 `rootPolicy=local-displacement` 后直接构造动画。`normalized-motion.js` 要求 `three-vrm-3.5.5-normalized-local-absolute` 坐标空间、严格递增的有限时间、单位四元数、匹配时长，以及源动作、normalized rig、鞋的 SHA 字段。只允许语义骨骼旋转和 hips 平移。这是离线适配结果可复用的消费入口。当前字段没有建立任意身体加衣物组合的碰撞适配保证。

`motion.js` 的 `fitSeatHands()` 依赖 `seatHandRadii`、`seatHandSurfaces` 与具体校准数据，调用还受 `corrections.footIK` 控制。已存在的两骨 IK 和接触修正不能证明全身舞蹈自碰撞已求解。未来离线结果还需经过同一 mixer、脚/手修正和动作进出过程，以检查重复修正及最终接触。

## R2ET 的代码核验

### 身份、许可和依赖

公开仓库为 `Kebii/R2ET`，本轮 `git ls-remote` 观察到 HEAD `41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572`。以下源码链接固定到该提交。仓库根 LICENSE 为 MIT，版权署名 Jiaxu Zhang，2023，分发时需保留相应版权和许可通知。README 记录 2025-01-12 修复此前结果抖动，项目人物上的时序质量仍需实测。[仓库与 README](https://github.com/Kebii/R2ET/tree/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572)、[LICENSE](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/LICENSE)

仓库包含借用代码。`outside-code/README.md` 指向 Daniel Holden 的动作代码，SDF 部分声明其 CUDA 核来源。正式复用需保留这些来源与各自许可。本轮未在检查的 `pretrain` 目录看到独立的权重模型卡或训练素材再分发授权说明。根 MIT 许可和 Adobe 的 Mixamo 使用 FAQ 还不足以独立证明所有训练角色、样例数据和权重的再分发条件。未来实验可以先使用项目自己已有的合法动作和角色，素材来源仍逐项记录。[借用代码说明](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/outside-code/README.md)、[SDF 说明](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/outside-code/sdf/README.md)、[Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)

文档环境为 Python 3.9、PyTorch 1.10.0、torchvision 0.11.0 和 CUDA toolkit 10.2，另有固定的 NumPy/SciPy 等依赖。`outside-code/sdf/setup.py` 构建 PyTorch `CUDAExtension`。网络模块顶层导入 `SDF/SDF2`，推理输入、模型和内部张量存在 `.cuda()` 调用，CLI 的 device 为 GPU 编号。未核验 CPU 回退、Windows 可复现安装、ONNX 或浏览器版本。当前开发机能否编译运行该旧工具链需要单独验证，现有项目 Python 环境不能直接视为适用。[环境说明](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/README.md)、[requirements](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/requirements.txt)、[CUDA 构建](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/outside-code/sdf/setup.py)

### 实际推理入口和输入

仓库文档提供以下入口，本轮没有执行。

```sh
python3 inference_bvh.py --config ./config/inference_bvh_cfg.yaml
```

配置指定 `phase=test`、`num_joint=22`、`k=0.8`、`weights=./pretrain/shape_aware.pt`、源/目标 BVH、源/目标形状 NPZ 和 `datasets/mixamo/stats`。已看到 `shape_aware.pt` 文件元数据为 5,898,990 bytes，以及六个 local/global/quaternion 均值和标准差 NPY。另有 skeleton/discriminator 权重，当前推理配置使用 shape-aware 权重。这里只核仓库文件存在和代码引用，未下载或加载权重。[推理入口](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/inference_bvh.py)、[固定配置](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/config/inference_bvh_cfg.yaml)、[权重目录](https://github.com/Kebii/R2ET/tree/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/pretrain)、[统计目录](https://github.com/Kebii/R2ET/tree/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/datasets/mixamo/stats)

`inference_bvh.py` 固定 Mixamo 风格的 22 关节名称/顺序和父子表。形状输入读取 `full_width` 和 `joint_shape`，将各关节三维尺寸除以全身尺寸后展平。必须明确转换本项目 raw/normalized VRM 骨骼、rest offsets、坐标轴、四元数和根运动。手指、辅助骨、表情与独立衣物不在此 22 关节适配合同内。[输入处理与骨架表](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/inference_bvh.py)

该推理分支没有要求源/目标共享顶点编号或三角拓扑，因为其实际输入为尺寸描述。它仍要求固定关节语义与描述维度。拓扑不必相同不能消除这些约束，也不能证明训练分布外体型的效果。已检查的仓库根许可中未见额外“仅研究”或“禁止商用”条款，具体第三方数据和权重来源需随正式复用范围核实。[推理代码](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/inference_bvh.py)、[仓库许可](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/LICENSE)

`datasets/extract_shape.py` 通过 Blender 导入 FBX，查找 `Armature`，将权重简化到 22 关节，按最大权重给顶点分区并计算各区包围盒。其 mesh 循环覆盖局部网格变量，未核验能正确合并本项目独立 Body、top、bottom、shoes 的几何和权重。若后续用这些代码，需先证明最终 shape 描述到底包含哪些表面，不能只把若干衣物文件放进目录就算完成适配。[形状提取代码](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/datasets/extract_shape.py)

### 碰撞、时序和衣物边界

训练代码和模型中确实有基于 rest mesh、faces、skin weights 的 SDF 排斥/吸引损失。公开 BVH 推理分支则接收上述形状描述，`RetNet.forward()` 按帧生成残差旋转、门控混合，并按身高调整全局运动。该路径没有逐帧输入目标衣物三角形再执行硬碰撞约束。不能由训练损失直接推定新胸围、下摆、袖口或多层衣物一定无穿插。[模型 forward 与几何损失](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/src/model_shape_aware.py)、[训练入口](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/train_shape_aware.py)

`k` 平衡基础动作与形状残差。当前代码有实际推理机制，但本轮未看到该入口执行接触窗口硬约束、关节限位或全序列速度/加速度约束。时序平滑、脚接触、手贴身体的保留和动作风格均需用本项目动作测量。较宽松的几何描述也可能遗漏局部衣物，代理结果必须回到真实蒙皮表面复核。[逐帧门控实现](https://github.com/Kebii/R2ET/blob/41c7e40fcb8a40eb3fb0deccf3d6b88b8230d572/src/model_shape_aware.py)

## Contact-Aware Retargeting of Skinned Motion 的证据边界

已核对 ICCV 2021 作者页面、arXiv 和会议论文。方法利用几何条件网络及 encoder-space optimization，识别源动作中的身体自接触和脚接触，并优化目标运动以保持接触、减少穿透。论文实验使用固定 22 关节子集，输入包括骨架、静止几何和 skin weights。论文讨论了目标之间冲突、较强排斥使动作变硬、启发式接触检测和固定关节数量等局限。任意网格拓扑的适用性仍受骨架和训练设定约束，独立多层衣物没有在本轮获得可执行验证。[论文](https://openaccess.thecvf.com/content/ICCV2021/papers/Villegas_Contact-Aware_Retargeting_of_Skinned_Motion_ICCV_2021_paper.pdf)、[arXiv](https://arxiv.org/abs/2109.07431)

作者项目页目前列出论文、arXiv、视频演示和联系信息。本轮未找到可核验的官方仓库、推理命令、检查点下载或软件许可，因此无法提供代码提交身份，也无法评估 Windows 编译或浏览器集成。采用该方案的前置缺口是拿到可合法使用的代码/权重及其环境说明，或另行评估复现训练成本。论文公开可读本身不能作为软件复用许可。R2ET 是另一篇工作的实现。[作者项目页](https://sites.google.com/umich.edu/camr)、[作者 Hertzmann 的研究索引](https://www.dgp.utoronto.ca/~hertzman/research.html)

## Mink 的代码核验

### 可复用求解器、许可和平台

仓库为 `kevinzakka/mink`，本轮观察 HEAD `5f800f0a369d05bab88b5e5582cf95122d3b82a5`。固定源码的 `pyproject.toml` 标记版本 1.4.0、Python >=3.11、`mujoco>=3.10.0`、`qpsolvers[daqp]>=4.12.0`。代码许可为 Apache-2.0，分发需遵循许可副本、通知和修改标注等条款，依赖与示例机器人模型各自的许可仍单独核验。用本项目已有合法角色制作模型可避免引入示例机器人资产。[项目配置](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/pyproject.toml)、[LICENSE](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/LICENSE)

没有预训练模型或训练数据依赖。项目构建配置包含 Windows AMD64，原生加速有回退路径，可优先评估 Windows 离线 CPU 环境。本轮没有安装或实际 import/求解，Windows 可运行仍待验证。未见直接浏览器/Three.js 运行入口，适合先将结果烘焙为现有 normalized motion 文件。[安装文档](https://kevinzakka.github.io/mink/installation.html)、[项目构建配置](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/pyproject.toml)

### 实际接口与约束

实际调用链是从 MJCF 建 `mujoco.MjModel`，建 `mink.Configuration`，设置任务和限制，调用 `mink.solve_ik(configuration,tasks,dt,solver,limits=...,constraints=...)` 得到速度，再以 `configuration.integrate_inplace()` 积分。`FrameTask` 给定 body/geom/site 的目标位姿，`PostureTask` 保持参考姿势。当前源码支持硬等式任务及可让步的 elastic constraints，无解会抛 `NoSolutionFound`。`examples/humanoid_g1.py` 实际配置了手脚、姿势、重心任务及手与桌/大腿的碰撞组。[求解实现](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/solve_ik.py)、[FrameTask](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/tasks/frame_task.py)、[人形示例](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/examples/humanoid_g1.py)

`ConfigurationLimit`、`VelocityLimit` 和 `CollisionAvoidanceLimit` 提供可检查的线性化约束。普通 `VelocityLimit` 跳过浮动基座，浮动基座需另用 `FreeJointVelocityLimit`。球关节角度约束是一阶近似，正交方向的大步仍可能越界，文档明确建议配合速度限制。碰撞限制使用 MuJoCo `mj_geomDistance` 的带符号距离和最近点 Jacobian，要求检测距离大于最小距离，且两者差额覆盖单步可能闭合的距离。[关节限制源码](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/limits/configuration_limit.py)、[碰撞限制源码](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/limits/collision_avoidance_limit.py)、[限制文档](https://kevinzakka.github.io/mink/api/limits.html)

### 真实身体和衣物仍需补的部分

Mink 输入是 MuJoCo 模型，未提供 VRM/glTF、skin weights 或 normalized VRM 骨骼导入。需明确关节 rest frame、米制、四元数顺序、自由度、限位和任务 sites，并校验往返变换。项目中两骨 IK 的结果也不能直接当作完整 MJCF 关节范围。

Mink 接口无需统一为 22 关节或固定顶点拓扑，实际自由度由输入模型定义。这个灵活性同时把人体模型、关节范围及碰撞代理的正确性留给接入方。[Configuration 与求解接口](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/solve_ik.py)

碰撞约束作用于刚性 body 上的 geom。MuJoCo 文档说明 skin 是可视对象，碰撞涉及的物理实体是 geoms，通常 mesh 碰撞还受凸表示影响。可按真实体型/衣物拟合多个代理，但独立衣袖、软下摆和多骨混合表面不能因此得到精确保障。Mink 当前碰撞配对还排除同一 welded body 和父子 body 的部分配对，必须读回实际启用的 pair 清单，不能只统计传入列表长度。[MuJoCo skin 定义](https://mujoco.readthedocs.io/en/stable/XMLreference.html#deformable-skin)、[MuJoCo mesh 定义](https://mujoco.readthedocs.io/en/stable/XMLreference.html#asset-mesh)、[实际配对过滤](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/limits/collision_avoidance_limit.py)

局部 QP 需要初始可行性和适当时间步。它没有自动完成全动作接触意图识别，也没有直接提供舞蹈风格、全序列 jerk 或全局最优保证。手触胸/头/另一只手时需显式接触窗口和目标，统一排斥会破坏这些动作含义。求解后还需在原 LBS 身体与衣物上重新测穿透，检查时序和姿势偏差。[任务和等式约束实现](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/solve_ik.py)

## 建议的单次非封存动作对照

以下是后续可执行实验的定义，本次没有开展。建议先验证 Mink 的转换和短片求解，R2ET 在环境与 22 关节转换通过后加入同一对照。CAMR 待获得实际代码和许可后再决定是否加入。

1. 固定现有 `dance-technical-once-v1`，源文件 SHA256 为 `2d785287de3c0187c76ed90ae6e0b76fed3008cb1a7a2ac75065720d3885304e`，clip 为 `Dance_Technical_7s_Once_v1`，时长 7.2 秒。该片具有抬臂、侧弯、交叉步、转体和小跳，并已有脚接触窗口。源动作与封存的 30 秒舞分别保留，实验使用新 candidate ID。
2. 选原男与一个 source/readback 已通过的宽体男性 v2 目标，共两个人物，每人固定实际 Body、top、bottom、shoes SHA。发布清单确定时写入全部精确身份，不能用“当前默认衣服”作为依赖。先保原骨长、单位、骨架和接触参考，避免在同一实验引入新的体型制作机制。
3. 先做 rest、零动作及已知单骨旋转的源到求解器再到 runtime 往返验证。核 normalized/raw 变换、四元数顺序、root/local 位移、源足底和游戏地面。若往返失败，停止该方法的舞蹈比较并留失败，不用运行偏移掩盖转换误差。
4. 对照当前重定向、一个固定 Mink 代理/任务/接触配置，以及条件满足时的 R2ET 发布配置 `k=0.8`。保存实际碰撞 pair、被过滤 pair、源接触窗口、关节限制、求解失败和所有依赖。每种方法只用一个固定配置，不搜索参数组。Mink 先核模型/代理，R2ET 先核环境、权重来源和 shape 描述覆盖范围。
5. 烘焙到既有 `normalized-vrm-motion.1` 消费链，另附精确衣物/表面/求解参数依赖凭证。运行消费侧的 body/rig/footwear 字段须真实计算。模型转换和烘焙程序是后续工作的实际缺口，本次没有提供这些程序。最终以同一游戏加载、mixer 和修正链重放，分别记录离线输出和最终运行输出。

### 必须记录的比较量

| 维度 | 输出内容 |
| --- | --- |
| 真实几何碰撞 | Body 与选中衣物 LBS 后的最大/p95 穿透深度 mm、受影响表面积、pair/三角身份、持续帧数和时长。源固有邻接/接触与新增穿透单独记录 |
| 意图接触 | 手与身体/另一只手的目标距离、滑移、接触开始/结束时差。实际有意接触的区段明确标注，不能只求增大间距 |
| 脚和根 | 脚底离地/入地 mm、支撑期脚滑 mm、root 轨迹偏差、着地时序 |
| 姿态和时序 | 关节相对源的角误差、手掌朝向、肘平面、速度/加速度/jerk、跳帧、限位越界、QP 无解率和发生时间 |
| 运行接缝 | idle→动作→idle、暂停恢复、同一 mixer 下的最终骨骼与离线差值，检查重复修正 |
| 生产成本 | 输入/工具/权重 SHA，预处理和推理耗时、CPU/GPU 与峰值内存、输出字节、重复导出身份。开发机数值只代表该设备 |
| 正常速度观看 | 同镜头全身、手胸/头和脚的局部近景，以及严重错位/滑步/持续穿插的时间定位 |

开放网格与衣物薄片的带符号深度测量需声明可定义范围，无法给可靠符号时保留相交 pair 和局部距离，不能将未知记作零。比较同时保留技术指标和正常速度画面。按用户现有尺度，轻微短暂交叉可由观看判断，零交叉计数本身不足以证明动作合理。

### 停止条件与本轮结论范围

若任一候选在许可/权重依赖、坐标往返、实际表面覆盖或接触意图上出现不可解的具体缺口，记录失败原因并停止该候选的当前实验。若一次固定求解降低穿透却造成明显跳姿、接触丢失或风格破坏，保留原始与失败输出，重新判断方法适用性。后续决定应依据这次对照，不通过反复调半径、动作幅度或逐人物控制补丁延长试验。

本轮确认了两个有实际源码入口的候选，以及一个尚缺可执行包的论文方法。尚未获得本项目的推理成功、真实衣物接触改善、时序质量或普通电脑性能证据。完整舞蹈库适配、冻结 30 秒舞和运行控制器均未在本轮研究中实施。
