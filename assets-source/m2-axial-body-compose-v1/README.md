# 原男完整lean请求的身体与头部数值合成

本包只做一次identity及原 `male-long-lean-v2` 十三个参数的完整源数值试验。未导出VRM/装备，未发布public或修改runtime。其余原七请求只保留在spec的metadata中，没有产生七项资源。

输入固定为原62b完整男VRM、原120935真实端点记录、已封头部G/J数组及原v2提取的身体B。所有输入/源码SHA在spec.json。最终spec为 `c42ec8f7a7a8d5b5bba4dd8a4760eb3350ec79c422753f4cf8da37a96ca36fa9`。

## 同源装配及保护参考

以同一原始rest米制P和原P+D计算 `F(P)=G(P)+B(P)`，`JF=JG+JB-I`。不在已变形人物上二次变形，不调用旧face_curve。九身体参数按原值进入已验body_displacement，四头部参数对应已封G。JB沿既有1e-5m中心差分约定，JG直接消费已独审的解析数组。作者N在各实际端点用最终JF经未改legacy.normal_map逆转置传递一次。

新组合合同明确区分身体请求和头部保护。原68neck ID与原8frame点均保留，原2µm门核头部增量 `F-(P+B)`；每点的B、头部增量、最终相对原源 `F-P` 分别保存。eye仍同时要求最终相对原源和头部增量≤2µm，且B必须为0。旧head-only schema、门和结果未重标。

依据是root明确的完整请求参考决定及独立 `evidence/m2-body-head-fixed-reference-audit-v1/REVIEW.md`，SHA `35db3e5374d85457f337aa6b84e6b5a55d01ec974de7cc36becea23f1553f2b0`。这是保护参考的显式新合同，没有改变几何目标、参数、点集或2µm/.12/2mm阈值。

## 准备修正保留

首准备把非线性G的1µm割线与解析JG差直接当作导数错误，点913残差1.59763395e-5触发自设回归guard。原spec、四脚本和失败数据在preparation-attempt-1及prepared/failure.json。

prepared/truncation-diagnosis.json用Fraction精确读原存储dY系数，确认探针跨75/76段。该有限割线与解析导数本来差1.59763284e-5。唯一回归接线修正保留这个整体残差作诊断，另外核实际B两步长差分（最大2.38624229e-9）和affine合成恒等式，解析JG沿原独审。没有修改eps、曲线、参数或正式几何门。

后续保护参考明确前的spec/代码/回执保存在preparation-attempt-2-pre-neck-contract，最终准备记录在prepared-final/report.json。其他preparation目录均为准备历史，不能当成额外完整源运行。

## 实际一次结果

| 数值项 | identity | 完整male-lean |
| --- | ---: | ---: |
| 实际源端点 | 120935 | 120935 |
| 最小JF determinant | 1 | .486337476530 |
| 身体单独最小JB determinant | 1 | .656010134971 |
| 真实101 Float32半宽最大误差 mm | 约0 | .825000032 |
| 101缺段 | 0 | 0 |
| eye的B/head/final最大位移 | 0/0/0 | 0/0/0 |
| neck头部新增量 µm | 0 | 0 |
| neck最终相对原源最大位移 µm | 0 | 173.985908，与B相同 |
| frame的B/head/final最大位移 | 0/0/0 | 0/0/0 |
| Float32位置最大读回误差 µm | .000232831 | .118263185 |
| Float32作者N最大向量误差 | 0 | 7.54192071e-8 |
| 新增精确退化/非正参考法线dot | 0/0 | 0/0 |

identity作者N及morph NORMAL delta均为0误差。完整lean为 `axial-body-numerical-candidate-only`，failures=[]。仅从保存的F-G读回，身体最大位移28.693155mm，既定distal手脚位移0，501条primitive/端点语义行保存在body-contribution-readback.json；没有再次求值B/G。

Body有7855个base点、无morph，Face有2056个base及54个原targets，总9911个base点、56records、120935真实端点。全部共享消费者与原属性在source inventory入口核身份，未沿用旧113713部分域。每case mapped-endpoints.npz保存sourceEndpointsM、mappedEndpointsM、float32BakeRoundTripM、sourceJacobians（此处实际JF）、mappedAuthorNormals、float32NormalBakeRoundTrip。normal误差无米制单位。neck与frame各有逐点分解JSON。三角diagnostics使用相同原Float32表达端点baseline。

## 执行与限制

唯一完整运行用时4.3976662s，递归进程树采样峰值168345600 bytes。2线程子进程，600s/3GiB限制。execution保存实际executed-spec、全部消费.py源码快照、输入receipt及进程记录。50ms RSS采样可能遗漏瞬时峰值，共享页可能重复计入。

```powershell
& experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-axial-body-compose-v1/prepare.py
python -B scripts/m2-axial-body-compose-v1/run.py --execute-once
```

本树不得重跑。独立重演时，将prepared-final、generated、execution完整移到该检出外归档，保原source/spec/脚本pin不变，再执行同一命令。NumPy2.4.2、SciPy1.18.1、监控psutil7.2.2。新执行具有独立身份，不能替代原证据。

上述是源端点JF与Float32数值门，没有证明B全连续域可逆或全浮点误差界。面积方向诊断与作者N传递不能替代strict、表达闭合或真实着色。head-only已知混合oh新增对明确继承未过。本新组合没有跑55strict/混合后验、独立衣物donor适配、接触重算或游戏运行。

原完整VRM中的内嵌衣物在本次数值数组上同样取direct B+G。后续真实资源装配仍需按已定衣物接缝处理body donor及直接G，不能把本数组当成独立装备fit。尤其当前head-only的裤鞋identity/forearm SHA不能直接继承到有身体体积变化的组合。未通过后验前不导出或声称完整male-lean人物通过，也未关闭原八预设主包。
