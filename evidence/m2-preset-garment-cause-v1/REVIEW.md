# 两代表衣物归因与共同接缝

当前4196 build `83decd027116` 的静态分诊已定位两个代表。此包只读源、已有实际截图与姿态，并补CPU虚拟同姿对照。没有创建修复资产、调用浏览器或修改运行时。

## 已确认的输入与现象

**丰满女默认衣装仍使用旧top。** 分诊capture中实际top为 `female-round-full-v2-top`，SHA `3d0ce805635972aa61242fde0b76943d2c844a226337c54333bcb50deef44872`。腰部修订fitTop为loaded=false，coverage为active=false、hiddenFaces=0。因此该截图不能作为2.252136mm腰部修订失败的证据。

腹前青块已有同姿隐藏层来源证据，以及完整不透明top与裤腰的实际射线诊断。本次重新读取同一源GLB，复算pants419、top894的绑定态前后关系，裤腰沿负Z前出 **1.187417mm**。原女同一pair已有约0.415207mm前出。该处属于 `F00_001_01_Tops_01_CLOTH` 与独立 `TrainingPants` 的层间次序冲突，完整top三角仍存在。旧实际姿态诊断有70/71青色候选像素对应裤面在前，剩余1像素仍未解释，证据build与本次build分别记录。[旧实际姿态诊断](../m2-representative-vest-source-diagnosis-v1/REPORT.txt)

**下摆鼓张有真实几何宽度变化。** 在同一源rest水平面y=.91m，上衣全X宽从317.710mm增至403.282mm，增加85.573mm。在y=1.09m，从223.465mm增至251.203mm，仅增加27.738mm。下摆/上腰宽度比由1.422增至1.605。Body对应两高度宽度也由271.385/181.529mm变为355.224/208.813mm。原版上衣已有下摆外张，当前Body形状与衣物传递共同保留、加重了这一轮廓。它并非材质颜色制造的假宽度。

**壮硕男腋下有衣物自身表面关系变化。** 源/新top材质同为 `M00_001_01_Tops_01_CLOTH`，实际同一primitive中的白衬衫及深色背心区域。源纹理全图alpha为255。索引、UV、JOINTS/WEIGHTS、材质、图片、节点与IBM均保留。男默认coverage为null。

源衣点74、80分别位移9.9/2.6mm，相邻同面点81位移48.3mm。它们的最近Body donor分别落在不同手臂/躯干部位。局部面100和106的几何法向分别转36.75/35.79度，原rest下没有参考方向翻转。这显示合法逐点donor及J并未约束相邻衣片的整体形状。

进一步用现有正式加载/蒙皮/动作代码建立虚拟idle，并将原、新衣物放入**同一目标骨palette**。限定左腋314个原三角，官方CGAL inclusive结果在source/target绑定态完全相同。虚拟共同idle中，派生相对原源新增147个无共享源ID或源坐标的pair，同时有旧pair消失，不能把总计数差44当新增数。

其中白袖tri293 `[220,223,218]` 与深背心tri1197 `[807,805,806]` 在原源共同姿态无交，派生交线长9.332mm。白袖296与背心1198交线长7.082mm，白袖331与背心1200为0.687mm。交线长度不是穿透深度。三角源ID、世界交点和纹理RGBA保存在male-pair-witnesses.json。白与深色面都属于top，不支持将这里直接归为Body露出的解释。

该虚拟姿态不是原截图的逐帧重放。相同相机附近的小框1260条CPU射线中，Body均在top之后，560条命中top白纹理，余下命中深色纹理。这为白袖/背心交错提供可复算支持，原截图黑尖片的精确outline像素归因仍未证明。

## 共同生产位置

`scripts/m2-representative-batch-v2/deform.py::Source.bind` 为每个衣点选不可变原Body最近三角。`Mapper.transfer` 使用 `衣点 + barycentric Body位移`，保持原世界offset向量。它不要求相邻衣点绑定同一连续衣片响应，也不约束top相对pants的外内次序。当前offset一致性仅验证该赋值，不能证明版型、穿插或动作后的余量。此次独立donor读回的最大offset向量误差约为女10.4nm、男58.1nm，表明实际输出遵循这条规则。

## 可复用的最小方案

现有**同一连续身体场可直接评估原衣物坐标**。`scripts/m2-representative-head-cage-v1/body.py::body_displacement(P,p,context)` 接受任意有限Nx3源rest米制点，没有依赖最近Body面或衣物索引的分支。它精确提取v2的only_limbs、trunk、taper和hand_limit部分。`scripts/m2-axial-body-compose-v1/common.py::body_values` 已给出该场的既有双侧差分J。`scripts/m2-representative-batch-v1/deform.py::normal_map` 可按实际J逆转置传输原作者N。

两套原top的mesh节点均无TRS/matrix，处于原Body同rest米制空间。全部服装骨名存在于对应原Body中，对应IBM最大差为0。这满足直接调用身体场的主要输入条件。此包尚未对衣点实际求新场或证明衣物外表面的det下界。

建议下一次只做identity与这两个既定代表的**一次CPU数组对照**，从不可变原top及实际原bottom读P，使用 `P + body_displacement(P)`，参数保持当前原值，Body保持现有固定输出。旧donor输出作为对照。只评身体九参数，避免重新调用失败脸曲线或在派生VRM上重复变形。全部top子primitive、领结/领带共享消费者按同一规则处理，原作者N使用该场J。服装原源、fit数据及新方法身份分别记录。

最小读回同时看全衣点J>.12、有限值、原拓扑/UV/skin/IBM/图像身份、源坐标别名接缝、局部面形状变化、女上述裤腰前出/下摆宽度及男同314面共同palette交叉。若仍自交或鼓摆，保留失败，不能以连续场名称或J过门宣称衣物通过。袖片接缝和版型余量应作为共享源模板的fit数据管理，未有证据前不固定单点或为每体建补偿控制器。

同场直接映射会改变原衣服余量在空间中的实际方向与大小，可能扩大已有下摆余量，**不能预先承诺消除鼓摆**。原top/pants已有微小干涉，双面直三角烘焙及不同蒙皮权重也限制连续映射的层次保证。若数值对照通过，仍需同固定候选的正常动作与可见画面验证。

已有官方Surface Deform源实现保存normal_dist并随新表面法向恢复余量，可作为直接场不能保持所需版型时的已研究备选。它不提供层间防穿保证，现有研究已经记录许可及原Body接缝前置，本包不再实施另一方法。[已核固定Blender源码](https://github.com/blender/blender/blob/e38faeb16cf5126b3eb1cfab82ee4e87b776278c/source/blender/modifiers/intern/MOD_surfacedeform.cc)

## 复现与限制

先以Node24运行 `node scripts/m2-preset-garment-cause-v1/pose.mjs`，再用含NumPy/Pillow的现有Python运行 `python -B scripts/m2-preset-garment-cause-v1/analyze.py` 和 `witness.py`。局部官方CGAL对照使用 `experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-preset-garment-cause-v1/local_contacts.py`。这是只读诊断，输出仅在本证据目录。

初次CPU适配遇到Node JSON import attribute错误，随后复用既有QA的JSON hook。首单步idle被控制器dt上限截为.05s，已保存first-dt-probe，最终改为1/120s步长累计到记录时间。最终虚拟pose仍不冒充浏览器真实帧史。没有新衣物、全动作、裙装、冻结舞或完整人物通过结论。
