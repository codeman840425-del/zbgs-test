# MotionBERT 纯3D姿态有界可执行性核查

2026-11-14核查、11-15归档。仅检查同一舞片困难3秒的时序替代；未下载权重、安装包、注册、训练或运行MotionBERT。没有修改当前能力清单或游戏。结论：**存在可行的纯17点CPU验证路径，可列为下一次有界实验；尚不能宣称能修好转身或替代现有动作。**

## 官方来源、许可与权重

- [作者GitHub](https://github.com/Walter0807/MotionBERT)当前核得revision `705d3a95354db8bdb696b3492e47a3b5537174ff`。其README直接链接[作者Hugging Face模型库](https://huggingface.co/walterzhu/MotionBERT)，不是第三方转换包。
- [代码LICENSE](https://github.com/Walter0807/MotionBERT/blob/705d3a95354db8bdb696b3492e47a3b5537174ff/LICENSE)和[含权重模型库LICENSE](https://huggingface.co/walterzhu/MotionBERT/blob/370a9196aa3c89198b134c82476143b01c0fb32c/LICENSE)均为Apache-2.0；作者模型库revision `370a9196aa3c89198b134c82476143b01c0fb32c`，API显示非private、非gated。模型卡的license元字段为空，但库中实际有LICENSE，不能误写成无许可。已查模型卡/权重目录未见额外非商用或仅正面条件；依库级许可作为本次技术核查依据，不把它扩为训练数据或SMPL许可。
- 使用/再分发代码与权重须保留适用许可证、版权及归属声明、已有NOTICE（若有），标记修改；无背书/商标授权。训练数据AMASS/H36M的取得和训练条款另属其权利方；本次不取训练数据，也不取SMPL模型。
- 对应[官方wild 3D pose文档](https://github.com/Walter0807/MotionBERT/blob/705d3a95354db8bdb696b3492e47a3b5537174ff/docs/inference.md)与默认config，明确选择 `checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin`，[作者文件页](https://huggingface.co/walterzhu/MotionBERT/blob/370a9196aa3c89198b134c82476143b01c0fb32c/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin)。API元数据64,099,897 bytes、LFS SHA256 `9811155371db4ca5d20f31a36a232d41012e12e1333882888a564d741861148f`。这是远端声明哈希，未下载，不能称本地实核。不是单纯pretrain encoder、不是mesh权重。
- 默认是single-person wild inference，无正面限定说明；这是适用范围说明，不是背向/完整旋转质量保证。

原始元数据及本机包版本留在 `motionbert-source-audit.json`。

## 现有数据如何复用

[官方输入转换](https://github.com/Walter0807/MotionBERT/blob/705d3a95354db8bdb696b3492e47a3b5537174ff/lib/data/dataset_wild.py)接收AlphaPose Halpe26，转为H36M17；模型实际吃`[batch,T,17,3]`，第三通道是2D置信值，不是深度。默认转换会索引17/18/19，**COCO17或MediaPipe33不能直接替换文件后运行**。官方可变T上限243；720帧不能一次输入。六张ROI是稀疏手部IMAGE对照，既不是身体连续序列，也不是MotionBERT的21点手输入。

现有720帧raw包含完整2D与PTS，可只读选困难段138–210（73帧，5.755750–8.758750秒，首末跨度3.003秒），不补帧、不重推理、不将稀疏6帧当连续6帧。沿原24000/1001采样，网络没有PTS输入，输出必须由adapter逐帧附回原frame index/PTS/time_base；可视化维持1×。不把73帧伸缩成固定3.000秒。需要额外上下文时须另标上下文与评价区间，不能悄悄扩大修复段。

以下为拟议的adapter映射，**不是已验证的官方MediaPipe适配器**：

| H36M索引/意义（按官方wild约定） | MediaPipe33原点 | COCO17对应或构造 |
| --- | --- | --- |
| 0 pelvis | mean(23,24) | mean(11,12) |
| 1/2/3 右髋/膝/踝 | 24/26/28 | 12/14/16 |
| 4/5/6 左髋/膝/踝 | 23/25/27 | 11/13/15 |
| 7 spine | mean(pelvis,neck) | 同左 |
| 8 neck | mean(11,12) | mean(5,6) |
| 9 nose | 0 | 0 |
| 10 head | 无同义实测点 | 无同义实测点 |
| 11/12/13 左肩/肘/腕 | 11/13/15 | 5/7/9 |
| 14/15/16 右肩/肘/腕 | 12/14/16 | 6/8/10 |

head是实质映射缺口：Halpe有独立head，MediaPipe/COCO无对应顶点。若选择耳中点/面点推算，只能明确命名为合成proxy，记录公式、输入点和合成置信策略，先看3秒2D对照；不能冒称真实头顶。可用原visibility作为adapter置信proxy并保留原presence、来源及语义；合成点可采用输入最小visibility等保守策略，但这不是AlphaPose校准置信值。不得统一写1、用Hands左右分类score替代身体关节精度、或把raw world.z喂作第三通道。

归一化也必须复用明确约定：原归一化xy先转原图像素 `(x*3840,y*2160)`，再按官方pixel路径减中心`(1920,1080)`、除`min(w,h)/2=1080`；或保留官方全片crop_scale路径并记录其尺度。不可直接对x/y各乘2减1而忽略16:9比例。这里建议固定pixel路径便于原图核对，但其输出pixel尺度仍不是米。

171/172的2D左右语义跳已存在于复用输入，时间模型可能仍接受错误命名；连续性改善不证明正确。146/147也有高置信强world跳，须同源图核对。不得只测一个角度或鼻点。该17点输出没有脚尖/跟点、手掌/手指及骨骼twist；不会直接解决脚底接触、腕掌或真实全局轨迹。需保现有源/适配/候选分层。

## CPU/GPU、Python与可执行路径

官方[安装说明](https://github.com/Walter0807/MotionBERT/blob/705d3a95354db8bdb696b3492e47a3b5537174ff/README.md)用Python3.7、CUDA11.6的旧环境示例；[requirements](https://github.com/Walter0807/MotionBERT/blob/705d3a95354db8bdb696b3492e47a3b5537174ff/requirements.txt)含matplotlib3.1.1、chumpy、smplx等跨任务依赖。不能把它整份装进当前MediaPipe Python3.13环境。

本机实核：系统Python3.13.11，PyTorch **2.14.0+cpu**，numpy2.4.2、PyYAML6.0.3、tqdm4.67.3、matplotlib3.11.1；torch真实import与两元素CPU加和成功，GPU未初始化。easydict、imageio、ipdb、smplx缺失。MediaPipe隔离venv没有torch。本机RTX4090/24564MiB、driver591.74存在，但当前系统torch无CUDA编译；不能据显卡存在称GPU可直接运行。未核全盘其他Python，项目analysis检索只找到既有MediaPipe venv。

[infer_wild.py](https://github.com/Walter0807/MotionBERT/blob/705d3a95354db8bdb696b3492e47a3b5537174ff/infer_wild.py)本身有CPU分支，但不是当前Windows直接一条命令就能跑通：8个DataLoader workers配合顶层执行缺main guard；DataParallel权重键前缀与CPU模型strict加载需核；旧torch.load与当前PyTorch默认行为也需验证。更关键是`infer_wild→vismo→utils_smpl→smplx`导入链，后者标注沿用SPIN许可。纯3D点推理无需触及这条mesh可视化链。

最小后续实验可仅复用固定版本官方 `DSTformer.py`/`drop.py`（核心依赖torch/numpy/标准库），以当前系统CPU环境建立薄adapter：用已存2D+PTS构造H36M输入，加载同config的dim_feat256/depth5/heads8/mlp_ratio4/dim_rep512/maxlen243，eval/no_grad，保留官方flip推理及反变换，保存原始17点输出与映射manifest。config读取可用已有PyYAML/标准命名空间，绕开easydict；直接数组推理无需DataLoader、imageio、ipdb、smplx或SMPL文件。修改只限边界adapter，不能自写替代模型。CPU时长、内存及新旧PyTorch兼容尚未实测，不承诺速度。

建议下一步只对同73帧难段做一次CPU时序候选，先固定head proxy/置信规则、输入映射和权重校验，再比较原片/2D/预测3D的双侧语义、真实转向和身体/腕/踝连续性；通过后才谈现有男女VRM回读。若需要更多新2D模型、训练或mesh才能继续，应退出此最小试验并报告缺口，不自动搭第二套平台。本报告不构成已执行授权或成功结果。
