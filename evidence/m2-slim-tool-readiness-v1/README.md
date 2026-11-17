# SLIM Windows 工具接入核查

2026-11-16。本包只检查机器、官方发布源码和包元数据，补充既有 `REPRESENTATIVE-SHAPE-PIPELINE-OPTIONS-2026-11-16.md`。没有安装、编译、生成 tet、调用 SLIM、制作新形状或改原失败。skin-domain 八LP的 status2 保留，不能由更换求解器推定八请求可行。

## 实际可复用入口

官方 Python 发布 2.6.3 已有真实三维四面体入口。固定 tag `2.6.3` 对应 bindings commit `1336e57322356b6b7fa66119bccd658c6a127cdf`。其 `src/slim.cpp` 直接包装 `igl::slim_precompute` 和 `igl::slim_solve`，F 为三角/四面体，V/V_init 为实际坐标。枚举实际导出 `igl.MappingEnergyType.SYMMETRIC_DIRICHLET`。旧文档中的类式 `igl.SLIM(...).solve()` 来自较早接口，本次试验应按固定发布源码的两个函数调用。源码核查证明绑定存在，wheel 尚未下载/导入，二进制中实际导出符号和本机三维执行仍待试验。[固定绑定](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/src/slim.cpp)、[固定枚举](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/src/MappingEnergyType.cpp)

该发布版 CMake 固定 C++核心 `f68f01c23ac82351e2543ce8c529b6d4c89fdf16`、Eigen3.4.0、nanobind2.7.0，要求C++17。它与当前主分支核心身份不同，本包分别固定，未把以前观察的 `b41f1944...` 当作wheel实际核心。核心pre_calc确实为tet建立三维梯度，slim_precompute接受四列F并按tet体积加权，slim_solve调用防翻转line search。官方709的3D路径另用体积示例数据和viewer，API小试可直接传数组而省去GUI/示例资产。[发布版构建](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/CMakeLists.txt)、[固定核心](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/slim.cpp)、[709示例](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/tutorial/709_SLIM/main.cpp)

约束为真实顶点索引 `b`、目标坐标 `bc`、软惩罚 `soft_p`。公开API没有一般稀疏线性/barycentric约束矩阵，也没有硬等式接口。当前202个source边附着点无法直接作为b索引传入，需先建立真实tet顶点/边点的对应或另做约束装配。加大soft_p也不构成硬满足证明。当前目标职责/保护相容性由独立分析负责，本包不替其作可行性判断。[SLIMData与API](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/slim.h)

## 本机实际状态

| 项目 | 实际观察 |
| --- | --- |
| 默认Python | 3.13.11，win-amd64，MSVC1944构建 |
| 已有数值库 | NumPy2.4.2、SciPy1.18.1、packaging26.0 |
| igl模块 | 默认Python及Blender附带Python3.11.11均未安装 |
| 编译工具 | 当前PATH无cmake/cl/clang/clang++/g++/ninja；常见VS/CMake/WindowsKits/MSYS/vcpkg路径不存在 |
| Eigen/libigl源码 | 项目scripts/experiments及列明常规安装域未找到Eigen头或libigl checkout，未作全盘不存在声明 |
| Windows包 | PyPI2.6.3提供cp312-abi3-win_amd64 wheel，20,239,839字节，本机packaging.tags确认接受该ABI |

当前最小候选是独立Python3.13虚拟环境中的官方wheel路径，无需先补本机C++工具链。wheel SHA256为 `1d91745ed0e78c56a04539e3231ce6faff49ae0dbe123caa2034e1886fcb2e7d`。ABI标签匹配尚不能证明DLL加载、运行时依赖或数值执行成功。完整元数据及其他Windows版本在official-source-readback.json。本轮没有下载任何wheel。[PyPI固定版本文件](https://pypi.org/project/libigl/2.6.3/#files)

C++备用入口可以是只链接 `igl::core` 的小型headless程序，调用同一API。但当前需要另备CMake、C++17编译器、Eigen和固定核心，配置时默认FetchContent可能下载其他可选模块，维护面高于本次Python core小试。当前没有编译成果。[安装文档](https://libigl.github.io/libigl-python-bindings/install/)

## 当前VRM接入的实际缺口

bridge-inputs.json直接读原女 `027bed60...b95` 16,311,576字节与原男 `62b44b03...5ff` 17,902,644字节。两者实际primitive均为三角模式，group和morph端点数量、material角色及源SHA已保存。它们没有供SLIM三维调用的tet连接。

已有 `scripts/m2-representative-cage-trial-v1/export.py` 可复用按原POSITION组追加base位置、法线、morph端点差，并保原索引/UV/JOINTS/WEIGHTS/nodes/skins/IBM/images。它的容器identity往返已有历史核验；新方法仍需单独核输出，不能把容器通过当作SLIM几何通过。这个exporter的generator字符串也要显式新身份，不能直接把新产物标成Blender modifier。

真正接角色前至少还需三个共同接口。

1. 有效、正向的头部体积域与source对应。原Face/FaceMouth/颈、独立材料接缝、开放边界和相交表面不能直接当成有效tet输入。如何包围全部必要base/表达点、怎样固定眼发接口、怎样保存源索引映射均待制作，当前未四面体化。
2. source点到同一体积映射的嵌入及目标装配。base和每个原端点都要在同一规则下求 `G(P+D)-G(P)`，留真实barycentric/越界记录；57女/55男端点与保护/嘴牙关系仍需逐项检查。体积映射对表达外点的有效性尚未知，骨架/权重不随位置修改并不自动证明蒙皮接触正确。
3. 真实法线、局部比例和接触核验。tet局部不翻转不等于项目det>.12、全局无重叠、面部意图达标、表达闭合或衣层无交。衣物仍由原body donor适配机制承担，SLIM没有VRM/衣物层次接口。此包不改变已有衣物/动作运行。

这些是需要实施和测试的桥接工作，当前没有可靠工时/性能数据。源码接入小试很小，角色体积域与端点验证属于后续独立工作包，不能按一次pip导入计为完成。

## 唯一建议的最小工具试验

建议下一次授权只执行**一个官方core三维tet API smoke**，不用角色、训练权重、外部模型或TetGen。此提案尚未执行。

- 新建独立venv，从上述固定PyPI wheel取得并核SHA，记录Python/NumPy/SciPy和实际`importlib.metadata.version('libigl')`、扩展DLL身份。使用binary-only策略，若无匹配包或DLL加载失败，保留失败并停止，不自动转源码编译。
- 手写四点 `[(0,0,0),(1,0,0),(0,1,0),(0,0,1)]`，tet索引 `[0,1,2,3]`，float64坐标/int32连接。固定core的volume公式为 `-(a-d)·((b-d)×(c-d))/6`，该顺序应为+1/6，实际运行仍先断言。无需网格生成器或外部资产。[volume实现](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/volume.cpp)
- 先以V_init=V、四点bc=V，固定SYMMETRIC_DIRICHLET、soft_p=1e5，调用slim_precompute后slim_solve(data,1)核identity。再新建一次data，仅将第4点目标Z增加1mm，固定调用5步，测实际残差和体积。两个状态是同一smoke的identity与非零响应，不作权重/迭代扫参。
- 保存输入/输出数组与SHA、实际签名、finite值、identity最大误差、单位tet的J/det、目标残差、时间和峰RSS。identity建议误差<=1e-9m；非零状态须有限、体积为正、det>.12，目标残差照实记录。任一接口/identity/正向门失败则停止，不切换能量/权重凑通过。
- 成功只能记“当前Windows binary能执行core三维tet SLIM”。角色接入、原八意图、皮肤/表情/衣物和游戏验收仍无准入。

## 许可和维护范围

已核固定SLIM核心和bindings的MPL-2.0声明/许可证。没有research-only或non-commercial条款、训练或预训练模型依赖；按MPL对覆盖源码的通知与分发修改履行义务，原人物资产许可继续独立保留。Eigen固定3.4.0也需保留其许可通知。官方distribution含多个可选copyleft/restricted模块，根MPL标签不能覆盖全部，当前smoke仅选core且不调用tetgen/cgal。wheel尚未下载，wheel内随附许可证与实际依赖二进制应在未来小试时核回，不能把本次源码核查写成所有打包模块商业分发审查通过。[核心许可](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/LICENSE.MPL2)、[bindings许可](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/LICENSE.MPL2)、[模块划分](https://libigl.github.io/python-bindings/)

## 回读文件

- environment.json记录本机搜索范围、ABI与模块情况。
- official-source-readback.json记录11个官方文件URL、commit、SHA、API符号和wheel元数据。
- bridge-inputs.json记录本次只读原VRM几何/端点合同。
- collect.py可重复工具/网络元数据核查，联网内容未来可能变化，以本次固定JSON为事实。此脚本不会安装或执行SLIM。

本次仅写本证据目录，未提交主树其他dirty文件。正式头笼生产失败与原素材保持。

独立可撤销工具位置固定为 `experiments/tools/slim-core-2.6.3/.venv`。未来可优先完整下载并锁定binary依赖；若复用既有包，明确--system-site-packages，仅以--no-deps安装libigl并记录真实导入位置。删除独立工具目录即可撤回，无全局Python修改。

本机已有NumPy/SciPy的METADATA、RECORD与全部随附license文件SHA固定在dependency-identities.json。RECORD身份不代表原wheel归档SHA。若新下载依赖，另固定wheel归档SHA及包内许可证。
