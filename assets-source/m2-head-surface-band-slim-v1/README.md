# 完整请求表面带 SLIM 单次试验

本包保原domain/embedding、原Head.fit公式、原lean/round参数、fixed语义和官方SLIM，只把输入guide集从23点扩展为共同请求表面带。原失败包、原源码、classification和原角色资源不改。没有新tet、角色导出、public/runtime/catalog写入，也未提交主树。

## 输入和纯CPU准备

固定独审 `evidence/m2-head-surface-target-semantic-audit-v1/result.json` SHA2276c75b3b8d22c0d9ffea0711f17bb01aa47fcdabd46c79f0ffea5e0886a1f2的共同集合。全部原101源Y平面参与的所有三角取闭区间相交，不按z或极值筛选，得到600tri/363原source IDs/343 exact native节点。带覆盖全部101和原23guide，带与fixed/frame交集0。

同坐标的重复源顶点请求逐值相同才合成同一native目标，未平均。两样原23目标np.array_equal，原参数不改。保1343 fixed-eye/neck与8frame，共1694 controls、4048free。原113713端点与498records逐值核source，原Qhull序embedding identity1.164e-15m；不以正向tet序替换嵌入。

prepared/source-band.json保完整source triangle IDs/source vertex IDs/source-to-node对应和源坐标。两个targets.npz/request.json保存原式生成目标/控制，不复制15MB旧classification。目标公式从原Head.fit目标段AST读取，未调用旧cage或旧求解。保原native23目标数组供回读。

目标算术的实际101误差lean.825000032mm、round.941696881mm，无缺段，未当数值准入。4804完全受控tet的exact目标分别8/10个<=.12，作为soft目标风险公开。它们没有被当作实际soft失败或真实2mm目标无解证。np.generic序列化和同node不同目标拒绝均有回归回执。

## 唯一实际执行

输入准备满足条件后，root另明确授权本次唯一运行。

```powershell
python -B scripts/m2-head-surface-band-slim-v1/prepare.py
python -B scripts/m2-head-surface-band-slim-v1/run.py --execute-once
```

两条均各执行一次，目录已存在则拒绝覆盖。正式入口只薄复用原递归进程树runner，执行新的本包solve.py；evaluate/common和fixed-eye/fixed-neck评价复用原已审实现。新方法/候选/schema身份独立，显式consumed-input表固定实际源码和数据，没有目录glob。

同5742nodes/37114tet，SYMMETRIC_DIRICHLET、soft_p=1e5，identity1步通过后两样各固定20步一次。未调权重、迭代、密度或变更目标。2线程/600s/3GiB；实际23.3208206秒，采样递归进程树峰RSS1017147392B，exit0，无stop。50ms采样存在瞬时峰值漏测及共享页重复计数边界。

identity全部nodes误差0，全部原选中source/morph端点最大1.1641716839774582e-15m。

| 请求 | 最小tet det | <=.12 tet数 | fixed端点最大误差mm | Float32真实101最大半宽误差mm | 缺段 | 实际原23最大残差mm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| male-long-lean | .005826535010 | 7 | .000390502 | 3.776645050 | 3 | 3.049530953 |
| male-round-stocky | .004797280603 | 6 | .150613651 | 4.785467130 | 0 | 2.635273661 |

两项均failed-not-admissible。lean固定点2um门过，round未过；两项det>.12与实际101半宽2mm门均未过。最大全部soft控制残差3.220238/3.086212mm，原native23输入逐值相同不代表求解后达到目标。Float32 morph bake误差约.118um，有限值与模拟bake精度过不抵消其他失败。

## 实际产物与限制

closure.json固定初末独立能量、目标/保护/实际切面、过程回执和本次结果。energy按固定官方公式独立读回，wheel未暴露SLIMData.energy。全部执行pin结束后SHA再次核验不变。

新case schema为surface-band-head-slim-result-v1，候选id为male-*-surface-band-slim-v1，sourceRequestId保原-v2。各case的solved-nodes.npz、tetra-readback.npz、mapped-endpoints.npz保原真实数组，后者键含mappedEndpointsM/float32BakeRoundTripM和tet J/det。G(P+D)采用原endpoint-records偏移/源索引及原Qhull序嵌入。actual101由原surface_widths AST在Float32 base模拟bake上重切，另保存Float64辅助，未实际导出GLB。

本轮无数值候选，未进行后验strict/表达、VRM/衣物/游戏验证。未测试的发根附着、眼白覆盖、闭眼嘴牙关系和连续组合表情仍需独立准入。本包只封存此共同输入方法的一次结果，不追加参数或新形状。

源码在scripts/m2-head-surface-band-slim-v1；原工具和角色许可沿既有固定记录。公开/交付原版本不受本包修改。
