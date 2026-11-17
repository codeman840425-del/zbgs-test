# 唯一运行的只读报告恢复

原正式运行15.571583100012504秒，采样进程树峰RSS933806080字节，exit2。native identity已通过，两个原请求也都实际返回并保存raw数组，但round报告在NumPy bool写JSON时失败。原generated/report.json保持stopped-no-retry，round原case报告保持fixed-solve-running，没有给原运行补成功标签。

新增recover_readback.py只读已存solved-nodes/tetra-readback/mapped-endpoints，复用原common中的数值/Float32/101截面读回。没有import或调用igl，不再运行任何求解器。序列化显式np.generic.item，实际np.bool_(True/False)及嵌套/数字回归通过，原serializer的同一失败已复现。

| 请求 | 最小实际tet det | 最大保护节点偏移mm | Float32实际101半宽最大误差mm | 缺段 |
| --- | ---: | ---: | ---: | ---: |
| male-long-lean-v2 | .004334895389437503 | .4108851247306406 | 13.94298779481748 | 7 |
| male-round-stocky-v2 | .001965903214879279 | 2.210167375034165 | 15.780096698861698 | 0 |

两项均failed-not-admissible。frame最大偏移分别1.4453e-8m/6.8326e-9m。det仍为正不等于满足原>.12门，soft约束也没有达到原保护2um要求。实际半宽由原surface_widths在Float32 base拟导出读回重新切面，未实际导出VRM。

恢复后的mapped端点、Float32点、tet J、det与原raw数组的最大差全部0。每个raw文件SHA、原运行/错误回执和全部原script/spec/prepared/generated前后SHA保存在report.json，allOriginalBytesUnchanged=true。恢复报告不改变原identity或失败。

两个详细case JSON含初末独立能量读回、原生目标、软控制残差、所有端点Float32精度和原101截面。所有先前未测的原三角strict/表达关系、实际VRM法线/蒙皮/衣物和游戏验收保持未测。没有M2或正式形状准入。

本次恢复命令已且仅已运行一次。目录存在时脚本拒绝覆盖。

```powershell
python -B scripts/m2-head-volume-slim-v1/recover_readback.py
```

## 未来隔离重演的必要步骤

原common.receipt会glob目录中所有.py。加入recover_readback.py后，旧prepared.json的四脚本receipt与当前目录不同，因此新检出直接调用旧run会判stale；原generated存在也会拒绝覆盖。这不是字节可直接重跑的生产入口。当前树不再运行求解，原identity+两次request预算已用完。

若后续另有明确重演授权，按以下顺序在**独立检出**操作。该说明不自动授予本轮再次执行预算。

1. 从包含本包完整文件的精确提交建立新worktree，记录提交号与独立绝对路径。原主树和原正式证据不移动、不覆盖。
2. 新worktree的专用tools目录由原三个已SHA核验wheel建立独立venv，binary-only/no-index/no-deps/require-hashes，使用本包固定requirements.lock。wheelhouse可从现工具归档复制并逐SHA回核，不能复制/重定位旧venv冒充新环境。原spec的140个实际pyd/dll SHA也必须在新venv全部通过，不能绕过。无需运行先前smoke脚本或编译。
3. 仅在该独立检出，把 `assets-source/m2-head-volume-slim-v1/generated` 移至 `assets-source/m2-head-volume-slim-v1/replay-archive/original-run/generated`，把旧prepared.json移至同archive的prepared.json。先固定移前/移后原文件SHA一致，保留旧失败，不删除以隐藏结果。
4. 在该独立检出另存replay-context.json，列新实验ID、原正式执行回执SHA、完整源码提交、目录、授权来源和已归档原SHA。新结果不能标成原运行补完成。
5. 执行prepare.py生成当前脚本集合的新prepared receipt，核新receipt确实包含recover_readback.py及原四脚本。源spec和原参数不变，source/domain/tool输入SHA必须全过。
6. 核对后才在该独立检出调用run.py --execute-once。新generated属于新实验身份，仍先identity门，且原600s/3GiB/固定迭代门保持。结束固定新回执与原结果作独立比较，不宣称跨平台/新运行逐字节确定。

本次仅补说明，没有建立重演目录、移动原文件、重建工具或执行求解。
