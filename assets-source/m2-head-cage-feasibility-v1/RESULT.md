原八请求的单次 min-t LP 全部返回 `proxy-infeasible`，HiGHS 状态为 2。固定源为 `5309c95b6c3d81755b5f9da885a308c84158d66b`，实际执行前输入及源码计划已提交到 `18b883818ed4b00f7bbdbf2724434004a0283cae`，plan SHA256 为 `ab3fb8cb3d9f4b2598437bc7ba84cf0a817d9779973390b83761f7ffa8d8fcaa`。

| 原请求 | HiGHS 状态 | 求解毫秒 |
| --- | --- | --- |
| female-round-full-v2 | 2，proxy-infeasible | 13.35 |
| female-long-slender-v2 | 2，proxy-infeasible | 2.22 |
| female-square-athletic-v2 | 2，proxy-infeasible | 11.34 |
| female-soft-wide-v2 | 2，proxy-infeasible | 11.78 |
| male-wide-muscular-v2 | 2，proxy-infeasible | 10.91 |
| male-long-lean-v2 | 2，proxy-infeasible | 2.11 |
| male-round-stocky-v2 | 2，proxy-infeasible | 10.10 |
| male-angular-athletic-v2 | 2，proxy-infeasible | 8.78 |

全部返回信息为 `The problem is infeasible. (HiGHS Status 8: model_status is Infeasible; primal_status is None)`。没有 primal 向量，因此没有可报告的最优 t、实际控制位移或解残差。summary.json 对这些量显式记为 null，逐请求报告保留不可得原因。不能为满足报表格式构造系数或位移。

本次矩阵为完整 606×27 实测响应，列顺序是 probeAxis×control，行顺序是 outputAxis×landmark。约束包括全部 606 个逐坐标 ±2mm 代理带、10 个前 Y 链差、9 个前宽和 9 个前后深非负，以及54个系数与 t 的界，共28变量、1294条不等式。c 全部显式自由符号，t 下界为零。没有 cap、正则化或容差扫描。

每性别全部27个 singular 值在 generated/report.json。按 `smax*max(A.shape)*float64_eps`，女 rank 阈值为1.4864e-13、男为1.5213e-13，数值 rank 均为27。女最大/最小 singular 为1.10464677/1.03796930e-6，condition2约1.06424e6。男为1.13055220/1.44503417e-6，condition2约7.82371e5。前后基准漂移和实测跨轴项均为零，完整数据保留原值。源坐标最大 float32 ULP 除2mm探针为5.96046e-5，最小 singular 分别是该尺度的约.0174和.0242倍。ULP 指标只是坐标量化尺度，尚无严格的矩阵谱误差界。数值秩、完整矩阵条件数及前述原八控制使用子空间的条件数描述不同对象，仍需保留物理可控方向的不确定性。

八次实际 LP 总求解耗时约.071秒，完整批次含输入检查和 SVD 为.227秒。依赖及源码摘要在结束后保持一致。只读 QA 的50项检查全部通过，其中确认两个已知标量系统的状态、全部固定字节、八个唯一结果及不可行结果没有伪造 primal。所有真实请求都不可行，直接 einsum 的可行解残差分支此次没有实际样本，不能宣称八体 primal 残差已核通过。QA 没有再次调用求解器。

root 独立原八失败系数线性读回见 `evidence/m2-head-response-linearity-v1/report.json`，其 SHA256 为 `f6ca0bf18a004b6afe9f6668cd8d13c5cd3a27a793bf44921579e946511e4ec3`。root 已量得原米级控制的202附着点逐坐标代理误差约1.07–9.25µm，远小于本次2mm代理容差。此引用只覆盖原八控制，本 worker 没有重复重算或扣除误差。

结论适用于已固定的线性代理与这些笼条件。若该数值不可行性成立，沿相同 A、同一代理容差及更强笼约束的 ridge 不能满足本目标。此次未产出独立精确算术不可行证书，也未证明实际非线性几何或其他控制结构全局无解。允许零间距/零宽/零深仅供弱必要性诊断，原真实水平截面、Jacobian及完整表情/接触准入均保原门。

没有新头部形状、Blender评估、VRM、衣物、public、控制器或运行验证产物。后续是否继续同结构由root据本证据决定。

复核现有产物可运行 `python scripts/m2-head-cage-feasibility-v1/qa.py`。真实 run 会拒绝覆盖已有 generated，保留这次唯一实际求解。
