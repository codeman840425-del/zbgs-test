# 当前原男轴向形状映射的 PCHIP 方法核查

2026-11-16。只读官方/本机源码与真实原source/全部端点区间。本轮没有构造新角色曲线或G、没有调用优化器、扫描参数、生成形状、导出或改旧包。研究仅覆盖当前原男及其已有四组请求的区间，女性未继承结论。

## 工具能力与范围

本机SciPy1.18.1已有PchipInterpolator、PPoly.derivative/roots/solve和BPoly.from_power_basis，不需安装。官方v1.18.1固定提交 `e4e854eaa8f18d807cd3496028e257e36caa93cc`。PCHIP为分段三次、C1、按输入数据保形的插值实现，内部斜率用相邻secant的符号规则及加权调和均值。它能复用作受限轴向函数的数值内核，没有原生VRM/固定角色接口，也没有det>.12保证。[官方PCHIP](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html)、[固定实现](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/scipy/interpolate/_cubic.py)

真实签名为PchipInterpolator(x,y,axis=0,extrapolate=None)，提供.c、.x及derivative(nu=1)。x须严格递增，重复的是identity**值**，不能重复Y坐标。共同结点可把dY、s、h作为三个分量使用。直接对f插值后切换identity，边界斜率未必为1。默认extrapolate会外推，未来应显式extrapolate=False并定义已核外侧identity。

SciPy为BSD-3-Clause，需保留通知；本轮无模型权重或收费资产。使用已装库及其既有binary依赖，实际bundle许可沿工具smoke归档。[固定许可](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/LICENSE.txt)

## 坐标和实际完整保护域

原男SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。原raw-head rest原点为 `[.0005088170291855931,1.5453999042510986,-.006267889402806759]`m。以下u是原POSITION减该原点的Y，x同样须绕该head X原点计算，没有地面/scene偏移或骨骼变换。

| 实际集合 | 完整原base/表达occurrences | 精确唯一坐标 | localY范围m |
| --- | ---: | ---: | --- |
| fixed EyeIris/Highlight/White | 17490 | 1280 | [.04140663146972656,.07488203048706055] |
| fixed neck | 68 | 63 | [-.11281824111938477,-.09536004066467285] |
| 8 frame | 8 | 8 | 仅-.113015193939209及.22421552658081056两层 |

这使用classification的fixed-eye/fixed-neck与原498 endpoint-records，不只neutral/base，也没有把Eyeline/Eyelash/EyeExtra重新归为rigid。intervals.json保存源SHA、极值对应material/endpoint/sourceVertex/坐标、全部frame坐标和实际来源。

保守可变开区间为 `(-.09536004066467285,.04140663146972656)`，宽136.766672mm。把整个neck与eye的Y范围保持identity是足够保护这些点的共同规则，不声称这是唯一可行支持域。

原正式101源Y为[-.04920782016754144,.029714864730834956]，上下余量约46.152220/11.691767mm。原23源顶点Y为[-.049217820167541504,.03092062473297119]。请求表面带最高Y=.036829471588134766，距eye下界4.577159882mm。

原四组男性已有101目标Y与23目标Y均在上述区间内。lean的101最下目标为-.06320781618101612，stocky为-.04520782130654877。四组101目标都严格有序，已有101半宽比例均为正；这些仅是输入结点/区间检查，没有计算某个新PCHIP的导数下界，不能据此宣布新G可行或将冲突clamp掉。

## 位移表示、护段与连续J

以局部坐标定义

    x' = s(u) x
    u' = u + dY(u)
    z' = z + h(u)

再加回原head原点。原请求对应的轴向关系可从既有公式/101目标读出，保原jaw/cheek/chin参数和目标。若对不同Y得到矛盾目标，应报告输入矛盾，不能平均、夹紧或偷减强度。

可研究在不同的frameLow、neckMax两Y取dY=h=0、s=1，在eyeMin、frameHigh也取同值，内部仍取原请求。PCHIP内部遇相邻零secant时把导数设0；其端点处理也抑制违背零secant的斜率。因此这四层能形成位移平坦护段，s-1、dY、h在接入点值为0且斜率为0，f=u+dY的斜率为1。实际构造后仍须直接核系数和值/单侧导数，而非只依算法名称作保证。完整eye/neck区间应落入平坦段，8frame在identity层。[固定斜率实现](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/scipy/interpolate/_cubic.py)

对这个单一轴向G，连续Jacobian为

    [ s(u)   x*s'(u)        0 ]
    [ 0      1+dY'(u)       0 ]
    [ 0      h'(u)          1 ]

故det J = s(u)*(1+dY'(u))。应同时核s>0和1+dY'>0。PCHIP对dY保形不自动保证u+dY单调，h虽不进入det仍会改变剪切/表面接触。若再叠加空间mask或另一body field，上式须按真正复合映射重推，不能把保护点J手设identity而漏过渡。

## 全区间界的成熟接口与证据等级

同一结点分区上s为三次，dY'为二次，q=s*(1+dY')每段至多五次。PPoly公开.c/.x，可从实际系数卷积构造q，derivative生成q'。理论上每段端点与q'全部段内实根即可给出全段极值，不能只查101点或源顶点。[PPoly接口与实现](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/scipy/interpolate/_interpolate.py)

PPoly.derivative().roots(extrapolate=False)是可执行的全段候选极值入口，须处理半开分段、端点、恒零导数段和非有限标志。但固定_ppoly.pyx使用double的companion矩阵/LAPACK特征值，并用Newton细化；仅接收被LAPACK判成实数的根。近重根、近阈值或跨结点数值情况不能凭该返回列表作严格隔离证明。[固定根实现](https://github.com/scipy/scipy/blob/e4e854eaa8f18d807cd3496028e257e36caa93cc/scipy/interpolate/_ppoly.pyx)

BPoly.from_power_basis(q)提供现成Bernstein转换。对单段归一化参数t∈[0,1]，Bernstein基非负且和为1，故q的全段下界为其Bernstein系数最小值。全部下界严格高于.12即可给出保守的全区间证据；若系数界过低，只说明该界未证，不能直接宣称实际q越界。[官方转换API](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.BPoly.from_power_basis.html)

默认转换仍为浮点加乘，未提供outward-rounded interval保证。可靠准入应针对实际保存的IEEE系数计入卷积/转换/求值舍入界，或对这些系数作精确有理复核后给Bernstein下界。该项是低阶多项式证据检查，不需要变形优化器。普通roots结果可作交叉定位；接近门限、根不确定或界未能证明时保留uncertain并拒绝准入，不能用加密采样换成全域证。

## 与旧tet表示及生产接入的区别

旧SLIM通过tet节点和重心嵌入给出分片仿射G，本次band已测det/轮廓失败原样保留。直接轴向G的连续J有独立定义，当前研究没有把旧tet变为通过。即使连续G在全域有正J，将其只在原顶点求值后导出的直三角仍是离散近似，实际101截面、法线、表情接触必须重读。旧坏tet也不能一项归因最薄单元。

未来若获授权，可复用现有source/原索引/导出器，按同一G计算base及每个原端点G(P+D)，保存端点差与真实法线；固定眼、neck、frame用同一函数实际评估。所有原表达严格接触门和游戏门仍在，单端点不替代连续混合。此轴向模型仅覆盖当前宽度/下颏纵向/投影请求，不能代表任意年龄/圆方脸解算器。

## 唯一建议的下一最小前置

建议先做一个独立的**函数系数前置**，尚未实施。固定当前原男两原请求、原101/23目标、上述完整保护域及四identity层。共同分区可按原band全部顶点uniqueY、原101sourceY及真实frame/neckMax/eyeMin边界的精确并集一次定义，不随结果增减密度；从原式产生s、dY、h及护段identity，保存全部系数、来源与请求残差。先核重复Y目标一致、C1/identity平坦段、全区间s及1+dY'和q的有证据下界。不生成角色或优化参数，不运行旧SLIM。若区间/数据冲突、原目标丢失、全段证据不足则停止并保留失败。

只有函数前置经独审通过，root才决定是否直接求值原source/morph与导出候选。届时原实际G Jacobian>.12、完整固定2um、真实101半宽2mm、全部原morph/strict和游戏门保持。当前只是官方内核与支持区间可供试验的证据，没有新曲线、形状或运行通过。

固定源码SHA为_cubic.py `dd6edb30b03a437dc66e9d937648ed7c47aa4a87d334fbf49451bfbc13c589bd`，_interpolate.py `92c50167ae74ed52af3cca3f714f8c80a827c7ae016da357208d4c32faad52eb`，_ppoly.pyx `356aeaa905108d3d86a0dad0b30fdef1ec72d8f12840558c17a49b9bdd974c2c`。本机前两源码SHA与官方固定版本一致，见intervals.json。

独立数学边界核查已固定在 `evidence/m2-axial-shape-formulation-review-v1/REVIEW.md`，SHA `0f4101dccecb142429c6483b59fb0ff583bec9b75e76113ba6c6493e5ac773cd`。本轮只确认当前输入顺序/保护Y区间没有已见冲突，尚未证明任何新曲线满足全段q门。
