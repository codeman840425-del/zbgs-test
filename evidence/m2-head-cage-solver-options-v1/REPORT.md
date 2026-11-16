现成 SciPy 的 `minimize(method='trust-constr')` 能承接当前 ridge 目标，并同时加入系数上下界和前侧环的线性顺序约束。本包提供可调用示例，已用合成数组验证接口。真实八体拟合次数为零，生产脚本和资产均未修改。SciPy 官方接口支持 `Bounds`、`LinearConstraint` 和 `NonlinearConstraint`。[官方 minimize 接口](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize.html)

当前输入与变量

实读 `F:/gamemake-representative-head-cage/scripts/m2-representative-head-cage-v1/head.py`，来源树提交 `9649f3c65eac0d76235b7f23d59104367c8383b6`，文件精确 SHA 见 environment.json。

- 每个内部环有 X、Y、Z 三个控制量。顺序采用先全部 X 环、再全部 Y 环、最后全部 Z 环。当前九个内部环共 27 个变量，首尾环和每环后两个角固定。
- X 系数对前左角取负、前右角取正。Y、Z 系数同向移动两个前角。系数单位为米。
- 现有三个响应块分别为 202×9。101 个固定源三角边附着截面点的左右端点组成 202 点，目标包括 jawWidth、cheekWidth、chinLengthM、chinProjectionM。`sample` 在原三角边固定插值，真实变形后的水平截面必须另外重算。
- 原目标为每轴 `0.5*||A c-b||²+0.5*λ*||c||²`，λ 为 .0001。2mm 探针除到响应矩阵中后 A 无量纲，b 与 c 为米。这一单位解释与 http_transport_review 的独立实读一致，本文没有重复计算响应矩阵。
- http_transport_review 已确认完整响应矩阵没有落盘。本包尚无独立核定的真实 A 输入。轴间耦合和大位移下线性响应有效范围须由该独审说明，不能由本接口示例推定成立。

本机实现与许可

系统解释器 `C:/Users/Administrator/AppData/Local/Programs/Python/Python313/python.exe` 实际导入 SciPy 1.18.1、NumPy 2.4.2，接口源文件及安装 LICENSE 已落 SHA。官方在线页面当前标为 1.18.0，NonlinearConstraint 的当前链接读取失败后使用官方 1.16.2 页面，并核了本机实际签名。主树 Blender 包含 Python 3.11，目录检查未发现其 site-packages 下的 SciPy 包，本次没有运行 Blender 或其解释器。系统 3.13 的 SciPy wheel 不能作为已经核验的 Blender 3.11 原位依赖。最小接线可由既有生产进程保存数值数组，交系统 Python 求系数，再由既有生产进程回读系数并实际评估。

SciPy 核心采用 BSD 3-Clause，允许商业使用和再分发，需遵守版权/许可文本保留与不得借作者名背书等条件。安装 wheel 的 LICENSE 还列有随包第三方组件条件，分发完整 wheel 时须保留对应许可。现有系统安装足以验证该接口，无需购买求解器。[SciPy 官方许可说明](https://docs.scipy.org/doc/scipy/dev/core-dev/index.html#licensing) [官方 LICENSE](https://github.com/scipy/scipy/blob/main/LICENSE.txt)

约束选择与几何边界

| 选项 | 当前变量可直接表达的条件 | 仍需实际几何核验的条件 |
| --- | --- | --- |
| `lsq_linear` 加 bounds | 独立系数范围，能保持凸 ridge 目标 | 一般环排序需要变量间差值约束，该接口没有 `LinearConstraint` 参数。若把每环范围切成互不重叠区间可间接保序，但会缩小可行域。 |
| `trust-constr` 加 bounds 和线性约束 | 27 变量的同一 ridge 二次目标，前侧 Y 环间距、前侧 X 正宽、前后 Z 正深均为精确仿射不等式 | 完整笼面/笼体合法性、实际 MeshDeform 局部 Jacobian、嘴皮接触、表情端点、衣物映射均需实际评估。 |
| `trust-constr` 加非线性约束 | 可以让回调逐个返回真实变形后的 `det(DF)`，设置下界 .12，并表达其他已定义的非线性量 | 一般是非凸问题。迭代成功不证明全局最优，求解失败也不证明不存在可行形状。有限采样的正 Jacobian 仍不证明连续全域注入或没有远距离自交。 |

`lsq_linear` 的箱约束问题是凸问题，收敛到的极小值是全局解。加入线性不等式后，本例目标 Hessian 为 `AᵀA+λI`，λ>0，因此数学上是严格凸 QP，并有唯一可行最优解。使用通用求解器时仍须读回数值收敛、约束残差和真实目标残差。[官方 lsq_linear 定义](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.lsq_linear.html) [官方 LinearConstraint 定义](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.LinearConstraint.html)

记内部控制嵌入全部环的序列为 cx、cy、cz，首尾为零。对相邻环，`restY[r+1]-restY[r]+cy[r+1]-cy[r] >= minGap[r]`。前宽为 `restWidth[r]+2*cx[r] >= minWidth[r]`。前后深为 `restDepth[r]-cz[r] >= minDepth[r]`。这三项正好拦住已发现的前侧 Y 顺序反转和 X 宽度翻转，并保留正的前后深度。它们属于笼控制点必要约束。实际输出还含空间权重渐变、固定锚点及 body displacement，输出场导数含权重梯度，不能从这些笼点关系推出实际网格导数下界。

本例把每轴系数限定在 `±cap/√3`，可直接推出每个移动前角三维位移范数不超过 cap。这是保守立方体，可行域小于同半径球。cap 以及正的 minGap/minWidth/minDepth 必须由下一次固定试验输入一次性明确，本包没有给真实头部擅定数值。合成自检中的厘米数仅用于验证约束确实激活。

非线性 Jacobian 约束需要实际 `F(P;c)` 回调、空间导数定义及采样域。现有 202 点线性响应 A 不能代替这些输入。若数值差分控制系数 Jacobian，27 个变量会增加大量真实几何评估，而空间 Jacobian 自身也需扰动坐标。所有 neutral/morph 端点共同计入才覆盖既有合同。`keep_feasible=True` 约束求解迭代的可行性，但有限差分探针、浮点误差及未采样区域仍须单独核。Blender float32 评估不适合直接套 complex-step。[官方 NonlinearConstraint](https://docs.scipy.org/doc/scipy-1.16.2/reference/generated/scipy.optimize.NonlinearConstraint.html) [官方 trust-constr 终止条件](https://docs.scipy.org/doc/scipy/reference/optimize.minimize-trustconstr.html)

最小可执行入口

`constrained_fit.py` 中 `solve` 接收经过独审的完整 A、同序 rhs、rest 四角环、controls、原 λ，以及一次固定的 cap/间距/宽度/深度/目标数值缩放。行可以是全输出响应。列固定为现有 27 个轴优先控制量。若仍采用现有三个对角响应块，可构造 `block_diag(*head.response)`，但这仅求当前对角代理目标，须保留轴间效应限制。

```python
from scipy.linalg import block_diag
A = block_diag(*head.response)  # 仅在响应独审允许沿用该对角代理后
b = (target - head.landmark_source).T.reshape(-1)
# 在系统 Python 调用 solve(A, b, rest.reshape(-1, 4, 3), controls, ...)
```

示例仅为 SciPy 接线，目标缩放对整个 ridge 目标统一除以相同尺度平方，不改变最优点。`maxiter=200` 为本示例单次 API 预算，数值终止参数写在函数内，不充当项目几何阈值。合成验证使用四个假环，迫使宽度、排序和深度约束激活，12 次迭代成功，实际约束残差为零，详见 self-check.json。它验证本机实现能工作，尚未验证真实头部可行性。

```powershell
python evidence/m2-head-cage-solver-options-v1/constrained_fit.py --self-check
```

下一次有界试验的输入与停止门

1. 先固定源及工具摘要、原八组请求、真实 rest/controls、实际探针与基准、A/rhs 的顺序/单位/响应有效性。当前 A 未落盘是实际输入缺口。
2. 一次明确 cap、最小笼间距/宽度/深度、真实 requested→achieved 最大容差。原 spec 没有这些新门，本研究不把任意数字写成已获准合同。cap/floors 的零位移可行性在调用前检查。
3. 单次求解若失败、超预算、非有限数，或读回系数越界、线性关系不满足，就保失败。不得通过逐变量 clip 后宣称解满足原优化目标。
4. 代理候选要交回原官方变形评估器，核实际笼位置、真实截面与源附着点目标误差、完整 neutral/morph 的实际 combined Jacobian 最小值、眼/发/嘴及其接触，继续遵守既有 determinant 严格大于 .12、2µm identity 门和现有 600秒/3GiB 预算。将来若加非线性求解约束，其闭区间下界还需留数值余量，最终仍按原严格门读回。达到 cap 而残差超固定容差时保留目标不可达记录，不扫 cap 或正则化。
5. 若笼必要约束通过而实际几何失败，记录具体端点/位置/导数或接触对。该证据才足以决定后续是否投入非线性约束回调；当前没有批准或运行额外形状批次。

先行的一次弱必要可行性诊断

root 补充的 minimax 系数诊断可以直接用已安装 SciPy 的 `linprog(method='highs')`。该接口接受线性目标、线性不等式和逐变量界，HiGHS 核心扩展在系统 Python 下已实际导入。HiGHS 官方采用 MIT 许可。这一补充只核接口和表达，没有运行真实或合成 LP。[官方 linprog](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linprog.html) [官方 HiGHS 许可](https://github.com/ERGO-Code/HiGHS/blob/master/LICENSE.txt)

令 `c` 为原 27 系数，增加第 28 个变量 `t`。已核定 A 的行按相同顺序对应 202 点全部三坐标，b 为 requested-source，ε=.002m。以 `g0+C@c` 表示前文三组原笼间距/宽/深。最小化 `t`，约束为

```text
 A@c <= b + ε
-A@c <= -b + ε
-C@c <= g0
 c[j] - t <= 0
-c[j] - t <= 0
 t >= 0
```

其中 g0 的非负容许环/宽/深恰好为零，属于这次诊断的弱必要门，会接受退化笼子。正式源门仍须正间距及原实际几何门。逐坐标 ±2mm 也是本诊断的附着点代理容差，三维点误差范数最多为 √3×2mm，不能当作原真实水平截面的 2mm 门通过。

对应接口表达可以直接采用以下小段。此处 A、b、C、g0 必须来自同一固定源快照及通过独审的响应提取，eps 单位为米。

```python
from scipy.optimize import linprog
n = A.shape[1]
eps = .002
I = np.eye(n)
constraints = np.vstack([
    np.column_stack([A, np.zeros(len(A))]),
    np.column_stack([-A, np.zeros(len(A))]),
    np.column_stack([-C, np.zeros(len(C))]),
    np.column_stack([I, -np.ones(n)]),
    np.column_stack([-I, -np.ones(n)]),
])
upper = np.r_[b+eps, -b+eps, g0, np.zeros(2*n)]
lp = linprog(np.r_[np.zeros(n), 1.], A_ub=constraints, b_ub=upper,
             bounds=[(None, None)]*n + [(0, None)], method='highs')
```

控制系数必须显式为自由符号变量。SciPy 默认把变量下界设为零，沿用默认值会错误拒绝负向控制。t 的非负界使目标有下界。当前 9 内环、11 总环时，606×27 的 A 对应 28 变量和 1294 条上述不等式。没有任意 40/60mm cap，也没有 ridge λ 或幅度扫描。

判读只针对固定线性代理。`status=0` 后重算原单位的全部残差、笼关系和 `max(abs(c))`，核 t 与该最大值相符，并记录 solver 容差及目标值。`status=2` 是 HiGHS 的数值不可行报告，须先核源/矩阵/符号/尺度和数值状态，不能仅凭它宣布非线性几何绝对无解。若确认为该弱线性系统不可行，使用相同 A 且还要求这些条件的约束 ridge 无法满足同一代理容差。若 t 很大，应与实际头/笼尺度一起报告，说明该响应表示在弱约束下也需要大控制量，不能靠挑较大的 cap 掩盖。`status=1` 或 4 只记超限/求解困难，必要可行性未定。有限 t 的成功也不推出真实网格通过，更不能推出原参数意图完整实现。[官方 HiGHS 状态与数值选项](https://docs.scipy.org/doc/scipy/reference/optimize.linprog-highs.html)

完整 A 即将由源作者一次提取。后续先封其数值与摘要，按 root 授权做一次上述诊断，再决定原 QP 选项是否有实际使用价值。本包没有先行替源作者改拟合流程。生产接线、真实八体求解、导出、图像与商业画风审查及运行验收均留在其各自工作包。本包最终状态为 `interface-verified-actual-head-solve-not-run`。
