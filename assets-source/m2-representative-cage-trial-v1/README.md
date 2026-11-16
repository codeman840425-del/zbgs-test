# Blender cage / Surface Deform 一次共同试制

本包状态为 **8 项全部 failed-production-admission**。已证明原男女与六件既有衣物可以通过真实 Blender modifier 的基础绑定门，也保留了一次八项相同请求的形变输出。整个横臂人物共用环形 cage 的控制传播改变了手指位置，原骨架仍在原处，因此不准入游戏。

## 固定输入与工具

基线为 `88ad482ebdb23e74dc9f4c5d971a556d60f1936d`。spec 保留原八套全部参数及原男女 Body、六件衣物 SHA。新 cage 和脚本为本项目原创 CC0-1.0，原模型/衣物/贴图沿原来源许可。源 VRM、skin、UV、材质、图片和表达绑定的原数据留在导出文件中。源 .blend 含原模型几何，CC0 声明不覆盖这些原输入。

固定工具为已安装 Blender 4.5.9 LTS，build `8bf95cbd38d1`，Windows x64。blender.exe SHA256 为 `42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024`。Blender 内 Python 3.11.11、NumPy 1.26.4。外部 runner/QA 本次为 Python 3.13.11、psutil 7.2.2，QA 使用已有项目 NumPy/Pillow 环境与 socks 几何诊断 helper。没有新增付费工具、训练或压缩格式。

## 实际基础门

`verified/preflight.json` 保存工具、spec、生产脚本和源依赖的 identity receipt。直接 batch 入口重新比较 receipt，输入改变必须从前置门开始。

- 男女 shared POSITION 组分别为 7825/2055 与 7855/2056 顶点，Blender from_pydata 后坐标字节和三角索引一致。源 mesh node 没有额外变换，米制高度为 1.597817m / 1.717148m。
- 初始封闭 cage 为 68 顶点、66 四边面、132 条边，每边两面。全部 base 与 56 女/54 男原 morph 端点处于 cage 内，最小边界余量约 39.99996mm。
- 实际 Dynamic Mesh Deform identity 最大误差为零。两性均使用原 target0 的真实非零 delta，额外以 3mm cage 平移确认真实 modifier 求值，端点误差女 2.84e-8m、男 2.47e-8m。该 affine probe 只验证接线与坐标，不能证明任意非线性表达组合。
- Body_SKIN 的独立 donor 只对精确重合位置做 weld，保存原 index→donor 映射 SHA，逐原三角坐标相等。donor 每边最多两面，原人物索引未变。
- 六件衣物共九组实际 Surface Deform 均 bound，identity 最大误差约 1.7903e-6m，小于固定 2e-6m 门。

随后 batch 建立同一语义高度规则的紧包围 cage，记录在每项 `cageRestPositionsM`。每个 cage 的所有源端点覆盖再次计算，并再次实际绑定和核 identity。参数只移动 cage 控制环，内部点由官方 Dynamic Mesh Deform 求值，独立装备由官方 Surface Deform 求值。旧 v1/v2 的人物位移场没有被调用来生成内部点。

## 八项实际结果

下面 det 是 body/base 与全部表达端点的固定影响权重、0.1mm 数值探针结果。它不能代表全空间可逆，衣物 Surface Deform 的空间 Jacobian 仍为 `unmeasured-not-passed`。source skeleton 保留也不能补足表面位置约束。

| 原请求 | 最大手/指/足区域位移 mm | 最小 body/端点 det | 所测最大截面请求差 mm | 四资源 bytes |
| --- | ---: | ---: | ---: | ---: |
| female-round-full | 188.655 | 0.912569 | 16.494 | 22373012 |
| female-long-slender | 111.807 | 0.637970 | 10.686 | 22373020 |
| female-square-athletic | 305.213 | 0.909367 | 25.104 | 22373004 |
| female-soft-wide | 141.191 | 0.913764 | 9.263 | 22372996 |
| male-wide-muscular | 458.311 | 0.893353 | 21.043 | 24626724 |
| male-long-lean | 121.813 | 0.412749 | 12.305 | 24626760 |
| male-round-stocky | 222.164 | 0.938343 | 23.288 | 24626780 |
| male-angular-athletic | 320.567 | 0.852788 | 30.336 | 24626764 |

`verified/*/qa.json` 有每项 hip/waist/chest 的宽深、jaw/cheek 半宽、颏最低位置、原值/目标/实际值和源顶点选集数量。该测量用固定源顶点带，不能等同完整移动截面或自然度评价。肩/上臂/大腿的三个原参数全部保留，但整圈控制无法给出独立局部肌肉实现，因而没有把环宽倍率称为它们的 achieved 值。八项均保留完整请求，状态反映未完成全部意图。

最大问题可精确定位到 male-wide-muscular 的 Body POSITION vertex4113，权重为 100% `J_Bip_R_Middle3`。源为 `[.781699538,1.397873402,-.036331847]`，目标为 `[1.239923239,1.397821665,-.045270003]`，位移约 458.311mm。相邻 y=1.396336436m cage 环的右边界从 x=.821699560m 移至 1.413988948m。原 `shoulderMass=.35` 和 `upperArmRadius=.42` 被全环宽度传播到手指。它是本次 cage 空间控制设计失败，既非单位错误，也不足以否定官方 modifier 的局部适用性。

## 衣物与身份读回

`verified/qa.json` 与各项 qa 保存实际 indexed rest 表面的相交 pair，以及全部源顶点到另一表面的 unsigned distance。pair 为含边界的非共面 segment-triangle 命中，coplanar、包含关系、动态穿透和有符号厚度没有通过结论。原女 Body/top、Body/bottom、Body/shoes、top/bottom 的 pair 数为 339/213/132/107，原男为 232/90/134/68。候选对应为女 326–342/210–215/132/95–107，男 232–254/90–104/134/68–80。数量不能直接表示穿透严重程度或已修复 68a 绿斑。

32 个实际导出资源逐项通过 nodes、skins/IBM refs、原 binary prefix、材质/texture 对象、VRM extension、索引、UV/JOINTS/WEIGHTS、有限非零 normals、morph 数量和有限性读回。原 image/IBM 数据在保留的 binary prefix 和原 accessors 中，不能把新增顶点 normal/morph normal 当成原样未改。导出 normals 按实际新三角与源分裂索引重算，受保护部分保原 normal。未获得表情连续混合、动作、衣物层次或视觉验收。

## 封存、一次实现修复与成本

`generated/` 留首轮原始输出，`attempt-1-source/` 保存首轮脚本和 spec。审查指出前置 receipt 未绑定 producer，以及 shared POSITION 的 normals/targets 需要显式断言。唯一共同实现修复用于这两个入口问题，未改变 cage、参数、precision 或 shape 求值。`verified/` 重导出只作该修复后的身份与重复字节核验，`repeat.json` 确认全部 32 个 GLB/VRM 字节一致。

首轮 preflight 约 1.52s、RSS 217.6MB，首轮 batch 约 4.02s。receipt 修复后的 preflight 约 2.02s、batch 4.77s，峰值 RSS 253.1MB。外部实际表面 QA 约 40.88s。runner 固定两线程、3GiB RSS 与 600 秒停止门，本次均未触发。八套四资源合计 187999060 bytes，完整 VRM 仍重复嵌入原图片，未扣减跨资源纹理对象。`.blend` 不声明跨平台字节确定性。

`negative-cases/report.json` 的三项均按预期拒绝。既存输出冲突、旧 receipt 与当前 producer 不符、源 SHA 错误都未生成新几何，verified 全目录哈希保持不变。输入篡改只使用临时镜像副本，镜像在检查后清理。其日志保留具体错误。

## 重建命令

在新目录重建，`--tool-root` 指已安装且 SHA 匹配的工具仓库根。本例参数不影响任何源输入身份。

```powershell
python -B scripts/m2-representative-cage-trial-v1/run.py --tool-root F:/gamemake --out assets-source/m2-representative-cage-trial-v1/rebuild
python -B scripts/m2-representative-cage-trial-v1/run.py --tool-root F:/gamemake --out assets-source/m2-representative-cage-trial-v1/rebuild --phase batch
python -B scripts/m2-representative-cage-trial-v1/qa.py --out assets-source/m2-representative-cage-trial-v1/rebuild
```

Python 外部依赖为既有环境的 NumPy、Pillow 和 psutil，Blender 内用其自带 NumPy。源码不执行渲染、录屏或动作。输出目录存在时 preflight 拒绝，batch 要求同目录真实 receipt，并拒绝重复执行的 batch 输出。

## 可复用的 v2 身体段与后续接口

root 已决定先审当前失败，当前包到此封存。以下只列现有复用边界。

- v2 `Mapper.field()` 的 `only_limbs` 保留真实 UpperArm→LowerArm、UpperLeg→LowerLeg 轴，径向分量、半径支持和端点 taper。原 `legacy.field()` 的 t/.15、末端 .78/.22 taper 使局部体积变化在关节端附近收束，避免本次全圈横向伸长含义。
- 躯干已有 hip/waist/chest 归一连续混合、纵向 support，以及基于实际 leftHand/leftLowerArm 的 `hand_limit` 横向衰减。这些代码可保留为现有身体候选机制，仍按新组合复核实际 skin 和衣物。
- 不能将全部 jaw/cheek/chin 参数设零就视为关闭 v2 脸场，因为 `face_curve()` 仍会投影源轮廓到固定凹族。head-only 试验需要显式分离身体位移段，保存其数值等价证明。
- head-only 剩余接口包括精确 rest/head 坐标、局部 cage 与 neck 交界、耳/眼/唇/牙保护、所有原 morph 端点、实际 normals 和 source/index 映射。表达端点应走同一局部映射后再构造新 delta，身体骨架与已有游戏动作消费合同继续核验。该新结构未在本包实现。

本次 trial 验证了成熟 modifier 的基础接线和数据保留，同时否决了这一整身环形 cage 的参数实现。没有降低 det 门、删掉 lean 请求或调小八组数值，也没有扩展公开资源、控制器或发型准入。
