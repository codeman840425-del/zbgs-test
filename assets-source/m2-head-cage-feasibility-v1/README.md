本包用原八请求和一次实测完整响应执行必要可行性诊断。调用系统 SciPy `linprog(method='highs')`，最小化最大系数绝对值 t。源码位于 `scripts/m2-head-cage-feasibility-v1`。

变量顺序为全部 X 控制、全部 Y 控制、全部 Z 控制，最后为 t。27 个 c 是显式自由符号变量，t 下界为零。全部量采用米。矩阵保留真实跨轴项和原 Head.fit 的 sourceLandmarks 基准，既不补零，也不扣除实测漂移。

原 202 个附着点各坐标要求 `abs(A@c-b)<=.002`。前 Y 链间距、前宽及前后深要求非负，允许退化。这是线性代理的弱必要条件。其逐坐标 2mm 与原真实水平截面半宽 2mm 门各自保留。输出状态仅 `proxy-feasible`、`proxy-infeasible`、`solver-failed`，几何验收固定为 false。

先等待源作者完成固定响应提交，运行 prepare 冻结输入 SHA 与源码 SHA。提交固定计划后才能执行真实 LP。prepare 会拒绝源工作区字节与确切提交不同，run 会拒绝计划未提交及已有实际输出，防止同包重复解真实请求。

```powershell
python scripts/m2-head-cage-feasibility-v1/api_check.py assets-source/m2-head-cage-feasibility-v1/api-check.json
python scripts/m2-head-cage-feasibility-v1/prepare.py --probe-root experiments/worktrees/gamemake-representative-head-cage --probe-commit EXACT_COMMIT
# 将新源码、inputs和plan.json固定为提交后
python scripts/m2-head-cage-feasibility-v1/run.py
python scripts/m2-head-cage-feasibility-v1/qa.py
```

两个已知标量系统只确认负控制系数和可行/不可行状态语义。真实八请求各最多一次，容差及求解设置固定，依赖或求解异常停止剩余请求。QA 只读保存系数，直接用原四维 Tensor 做 einsum 回读每个坐标残差，检查实际笼坐标和欧式控制位移，不再次求解。

`generated/report.json` 保存每性别全部奇异值、rank 容差和 condition，并把跨轴幅度、基准漂移及坐标 float32 ULP 尺度与最小奇异值一起记录。ULP 指标仅表示量化尺度，不能当作响应矩阵谱误差界或真实可控秩证明。

每请求 JSON 保 HiGHS status/message、时间、t、所有原单位坐标残差、全部不等式 slack、Y 链/宽/深及实际笼位移。不可行结果没有返回 primal 向量，相关残差和位移不能补造。数值不可行限本固定代理，未提供独立精确算术不可行证书。

本包没有 Blender 评估、新形状、VRM 导出、public、controller 或浏览器操作。即使代理可行，真实 MeshDeform、完整表情端点 Jacobian、眼发嘴边界和接触仍需后续独立有界验证。

接口依据来自 [SciPy linprog](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linprog.html) 与 [SciPy HiGHS](https://docs.scipy.org/doc/scipy/reference/optimize.linprog-highs.html)。
