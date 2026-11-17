skin-domain 新响应的八个同条件 LP 全部返回 `proxy-infeasible`。原包的八次失败身份及全部原始字节保留。新源提交为 `23d934497d50afa4b21002f551a11d624ab75e1b`，本次执行前固定提交为 `bdcb49b54a06c6e7c42c1feb9f44f0fa509bd8fb`，plan SHA256 为 `dd07376ecfdd6d55ed7b9cdbb1887ae825a06a1b1962e674fbe8981082ac1707`。

| 请求 | 原域 | skin-domain |
| --- | --- | --- |
| female-round-full-v2 | proxy-infeasible | proxy-infeasible |
| female-long-slender-v2 | proxy-infeasible | proxy-infeasible |
| female-square-athletic-v2 | proxy-infeasible | proxy-infeasible |
| female-soft-wide-v2 | proxy-infeasible | proxy-infeasible |
| male-wide-muscular-v2 | proxy-infeasible | proxy-infeasible |
| male-long-lean-v2 | proxy-infeasible | proxy-infeasible |
| male-round-stocky-v2 | proxy-infeasible | proxy-infeasible |
| male-angular-athletic-v2 | proxy-infeasible | proxy-infeasible |

八次均为 SciPy status 2，实际 HiGHS 消息为 `The problem is infeasible. (HiGHS Status 8: model_status is Infeasible; primal_status is None)`。没有 primal，因此最优 t、实际控制位移和解残差不可得，summary.json 对前两者记为 null。没有构造替代系数或角色。

旧新 sourceLandmarks、原八 requests 及目标、源身体、原27控制及索引/符号、全部权重描述和其余非声明字段逐值相同。原目标/响应 AST 和原 Head.py 摘要保持。新实际 schema 为 `head-cage-skin-domain-response-v1`。实际变化为 schema/时间元数据、domainPrerequisite、productionAdmitted=false、restCagePositionsM 和真实 response/probes。全部差异在第一个实际 LP 前核完，没有非声明差异。

新域使用实际引用的 Body_00_SKIN、Face_00_SKIN、FaceMouth、FaceBrow 全端点。必要 active 点 outside 为零，完整端点 identity 为零。原 weights、保护边界、20mm padding、27控制和请求均保留。完整四维 Tensor 保真实跨轴值，基准仍为 sourceLandmarks，没有改名套旧 guard，也没有静默改 block diagonal。

| 性别 | 原笼宽 m | 新笼宽 m | 原 condition2 | 新 condition2 | 新最小 singular |
| --- | --- | --- | --- | --- | --- |
| female | .549768954515 | .208198815584 | 1.06424e6 | 9.28972e5 | 1.35228e-6 |
| male | .598868668079 | .212518222630 | 7.82371e5 | 1.41603e5 | 9.13408e-6 |

宽度表由固定 float32 rest 坐标转 double 后相减。源作者男宽标量为 .212518215179m，二者约7.45nm之差来自 float32 减法舍入，底层 rest 坐标相同。完整 singular 值、rank 阈值、数值秩、跨轴及漂移和ULP指标保在 generated/report.json。新 numerical rank 均为27，跨轴最大值及前后基准误差/漂移均为零。量化尺度和数值秩的原有限制继续保留。

求解直接复用原 `solve.py`，固定同样逐坐标 ±2mm、前Y链/前宽/前后深非负、自由符号 c、t>=0和60秒单例预算。新八次实际 LP 总耗时 .079766秒，批次含检查及 SVD 为 .239319秒。51项只读 QA 全过，没有再解真实请求。此次所有结果都无 primal，可行解的 tensor einsum 残差分支没有真实样本，不能称已检查八份解残差。

上述条件允许笼退化，只检固定线性代理。数值不可行尚无独立精确算术证书，对真实非线性网格或其他控制结构不作全局无解断言。本次没有 cap、容差或正则化扫描，也没有 Blender、新形状、表情/接触几何评估、VRM、衣物、public、controller 或浏览器修改。

旧包 run/solve 及输入、旧 plan/generated 均按新 plan 记录的 SHA 保持，原包文件未修改。复核命令为 `python scripts/m2-head-cage-skin-domain-feasibility-v1/qa.py`。后续是否继续同结构由 root 决定。
