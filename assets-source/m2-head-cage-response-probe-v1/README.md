# 原 Head.fit 完整响应取证

本包只执行响应采样，状态为 `response-probe-complete`。两性各一次27个2mm控制探针，未求解新控制系数、未生成八请求形状、未导出 VRM/衣物。原八项失败保留。

固定 Blender 4.5.9 LTS/build8bf95cbd38d1，二进制 SHA `42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024`。实际 NumPy1.26.4、Blender Python3.11.11，工具和原源码/源 VRM SHA 见 spec、generated/manifest.json 与 run-report.json。原 head.py/Head.fit 字节未变。

probe 从原 fit AST 原样提取 P 赋值与 response 分支，并排除后续 lstsq/巨大 cage 设置。请求点函数也只取到原 target 构造结束。通过实例 evaluate 观察器保存每个探针实际3D结果，没有丢弃跨轴分量。

## 数据合同

`generated/female.json` 和 `male.json` 均使用 `head-cage-response-probe-v1`。

- responseMatrices 为 `[probeAxis][landmark][control]`，与原 Head.fit 同轴矩阵逐值相等。
- responseTensor 为 `[probeAxis][landmark][control][outputXYZ]`，shape 为 `[3,202,9,3]`。定义严格沿原分支 `(probedSample-sourceLandmarksM)/.002`，没有减去 evaluated rest 漂移。单位为 metre/metre。
- flattenedResponseAxisMajor 为 `Tensor.transpose(3,1,0,2).reshape(606,27)`，行按 outputXYZ→landmark，列按 probeXYZ→control。sourceFlatAxisMajor 与 requests[].requestedFlatAxisMajor 使用同一 outputXYZ→landmark 行序。
- restCagePositionsM 是实际44点闭笼，controls 是9个内部 ring 号，controlVertexIndices 给每个 ring 的两个 front 点。X signs 为 `[-1,+1]`，Y/Z 为 `[+1,+1]`。probes 中有实际 Float32 cage 顶点3D差值及所有 landmark 的实际3D差值。
- sourceLandmarksM 是原 Face_SKIN 三角边点。landmarks 保存边 a/b/t、所有关联源 triangleIds、两个源顶点空间权重、其插值权重和 directPointWeight。sourcePointsM、sourceFaceTriangles、sourceFacePositionAccessor 提供真实原几何定位。
- 实际响应先变形源顶点，再按原 a/b/t 插值，不是直接调用点处的映射。两种权重最大差女约0.08023、男约0.14690，不能混用。
- sourceTarget=-1 表示 mesh base，区别于 authored Neutral morph0。rawHeadRestOriginM 记录原 raw-head rest 参考，坐标为原 VRM POSITION 米制，无运行时地面/角色平移。
- requests 保留全部原四女/四男参数和原 target 构造结果。身体参数完整保存，但响应采样沿原分支的 parameters=None，不重复叠加身体场。

identityBefore/After 均给所有 source 点的最大误差与全部 landmark 实际3D坐标，另有 identityLandmarkDriftM。本次均为零。maximumCrossAxisResponse 实测为零，完整 tensor 仍保留全部分量。

## 一次实际执行

耗时4.27秒，峰值RSS232.57MB，两线程，3GiB/600秒上限未触发，exitCode=0。没有失败重试。manifest 固定数据文件 SHA、源输入 SHA、提取 AST SHA、工具和环境。此回执不授予任何生产或游戏准入。

```powershell
python -B scripts/m2-head-cage-response-probe-v1/run.py --tool-root F:/gamemake --out assets-source/m2-head-cage-response-probe-v1/recheck
```

输出目录必须是新的包内子目录。重跑命令只供重现，当前没有再次执行。

本矩阵描述原 base landmark 的局部控制响应，不能证明大幅控制下的 cage 可逆性、实际表面截面、表达/混合/装备或视觉结果。外部 LP 只能先作必要条件诊断，后续结果保持独立身份。
