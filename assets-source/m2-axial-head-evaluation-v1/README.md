# 完整原源轴向头部数值读回

本包读取已封存的 PPoly 系数，对原男 VRM 的全部实际引用 POSITION 及真实 morph 端点执行同一个 G。没有重建 PCHIP、运行 SLIM、导出 VRM 或执行 strict 接触检查。

原源为 `prototype/public/assets/foundation/base-male-roundtrip.vrm`，SHA256 为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。全部输入、官方数值库及原 reader 身份见 `spec.json`，冻结执行输入见 `execution-spec.json`。

覆盖由原 GLB 和已独审 inventory 逐属性重建。Body POSITION accessor 7 有 7855 个全部引用顶点、6 个 primitive、无 morph。Face accessor 21 有 2056 个全部引用顶点、9 个 primitive、54 个 morph target。共有 9911 个 base 顶点、56 个完整组端点记录、120935 个实际端点 occurrence，无未引用 POSITION。旧 113713 分区没有用于覆盖。

`prepared/endpoint-records.json` 的每条记录包含 positionAccessor、endpoint、targetPositionAccessor、完整 sourceIndices、offset/count 及该共享 POSITION 的所有 primitive references。`prepared/fixed-source-masks.json` 从原 GLB 的 EyeIris/EyeHighlight/EyeWhite 实际索引生成眼集合，仅从原域记录读取明确的 68 个 neck 索引，并读取原 8 个 frame 点。mesh 67/68 均为 identity 根节点，所有点使用同一原 rest 米制空间。

每个 `generated/<sourceRequestId>/mapped-endpoints.npz` 保存 sourceEndpointsM、mappedEndpointsM、float32BakeRoundTripM 和 sourceJacobians。三角诊断使用原 Float32 base 加原 Float32 delta 的渲染端点作基线，共 501 条 primitive/端点记录。法线点积是相对方向诊断，不能代替 strict 相交、shading normals 或表情闭合检查。

identity 通过后只执行原 lean、round 各一次。两项的 head-only 四参数实际施加，原请求中其他 body 参数仅保溯源。它们没有形成完整 lean/stocky 人物。

| 数值项 | lean | round |
| --- | ---: | ---: |
| 实际 Float32 101 最大半宽误差 mm | 0.825000032 | 0.941696881 |
| 实际 G 全端点最小 Jdet | 0.486337477 | 0.976210642 |
| 固定眼/neck/frame 最大位移 m | 0 | 0 |
| Float32 base+delta 最大读回误差 µm | 0.118263185 | 0.106780983 |
| 新增精确退化/非正参考法线 dot | 0 / 0 | 0 / 0 |

identity 的全端点 G 位移为 0，Float32 模拟读回最大误差为 0.000232831 µm。原 101 AST 在完整 Float32 Face base 上计算，每项均 101 段且无缺段。上述 Float32 数组是模拟烘焙读回，没有实际 GLB 导出。

存储系数段内的实多项式下界沿原函数包及独审证据。本包记录实际 source/endpoint 上的解析 G Jacobian，未证明全浮点输入域误差界，也未把原失败 tet 门改为通过。连续 G 与离散烘焙三角、线性 morph 中间混合不同，strict、闭眼/口腔、附件适配、输出 normals、VRM 导出及游戏验证仍待后续。

执行耗时 3.147 s，递归进程树采样峰值 143654912 bytes，2 线程子进程，600 s / 3 GiB 上限。50 ms RSS 采样可能遗漏瞬时峰值，共享页可能重复计入。首次 launcher 使用专用 venv 时因缺少 psutil 在启动求值前退出，没有生成输出。随后用现有 host Python 3.13 和 psutil 7.2.2 只负责监控，实际求值子进程仍为固定专用 venv，NumPy 2.4.2 / SciPy 1.18.1。原始异常保存在 `launcher-observation.json`。

在本证据目录中不再运行。独立检出重演时，先完整保存本包 prepared、generated、execution-spec.json 到该检出之外的归档目录。保 spec 和源脚本字节不变，运行 `prepare.py` 重建 source-only records，然后按原 `execution-spec.json` 的明确路径清单重新计算输入 SHA 到新的 execution-spec.json，再运行下面唯一入口。重演具有新的执行身份，不能覆盖或重标原正式证据。

```powershell
python -B scripts/m2-axial-head-evaluation-v1/run.py --execute-once
```

监控宿主须已有 psutil/NumPy，求值子进程固定到 `experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe`。该入口拒绝已存在的 generated 目录。应以 generated/report.json 和每 case 的 failures/status 读结论，进程成功退出本身不表示数值门通过。

仅成功数值候选可交独立后验。它们不表示人物、完整八体、表情、视觉、性能或 M2 已通过。
