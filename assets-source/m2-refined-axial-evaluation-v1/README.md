# 共同一级拓扑的轴向数值求值

三项唯一运行均通过本包数值门，**仅 numeric candidate**。未执行接触判定、VRM 导出、真实 expression manager 或游戏验收；旧 lean 混合与 round 单态失败不改标。

| 原请求 | 实际 101 最大半宽误差 | 实际端点最小 det J | 固定点精确位移 | known-oh A−B 最大距离 |
|---|---:|---:|---:|---:|
| identity | 0.0000877 mm | 1 | 0 | 约 1.7e−15 mm |
| male-long-lean-v2 | 0.182096 mm | 0.486337 | 0 | 1.936016 mm |
| male-round-stocky-v2 | 0.325365 mm | 0.976211 | 0 | 0.929719 mm |

101 无缺片；同拓扑、同表达 Float32 原源基线相比，新精确退化/非正法线点积计数均为 0。计数不证明无自交。最大端点 Float32 烘焙误差 0.121 微米；新增眼点使用真实 refined material 消费者集合，保原 neck68/frame8。identity 完整位置及作者 N 精确不变，54 个 NORMAL delta 全零。41 个共享边中点映后完全相同，Face 全 54 morph 在这些中点的 delta 为零。局部 Body 加细仅闭合必需接缝，不改善其它粗 Body 面。

唯一计算进程树采样耗时 14.446 秒、峰值 250335232 bytes，线程环境 2；600 秒/3 GiB 内完成。每 case 完整 406701 个实际端点（Body7896×1 + Face7251×55），另明确求值 frame8 与 known-oh B7251，不隐藏为原端点覆盖。后续 array-readback 仅读取保存数组，不调用 G。

## 身份与原源

`spec.json.cases[].id` 是原候选 ID 的溯源字段，**不是本包的新资产 ID**；`sourceRequestId` 指原请求。新身份由 `m2-refined-axial-evaluation-v1`、spec SHA、共同拓扑及每 case 产物 SHA 确定。无可注册 runtime 资产；不能借旧 profile、旧 VRM SHA 或旧单态 strict 准入。`closure.json` 显式记录 originalCandidateId/sourceRequestId/newEvaluationId。

复用已封原 G/PPoly 和 normal_map AST，没有重建曲线、调参数、增加细分等级。N 取共同 S 线性插值后的作者 N；沿用原 helper 的 `max(abs(J−I)) > 1e−6` 分支和原 N 长度恢复，未重算法线。J 属于连续 G 的实际输入端点求值，非旧 tet 门，亦非浮点全域证明。

## 下游精确入口

- `prepared/endpoint-records.json`：56 条 accessor 来源 ID / endpoint / offset / count。Accessor7/21 仅原源身份，不是已导出新 accessor。
- `prepared/topology-{7,21}.npz`：`triangles,parentTriangle,parentBary`。
- `prepared/consumer-records.json`：每个原消费者的全局新 triangleIndices/vertexIndices；parentMetadata 保原 parent 消费者及局部三角 ID。全部 6 Body/9 Face 消费者保留。
- `prepared/source-group-{7,21}.npz`：`basePositionM,positionDeltasM,baseNormal,basePositionFloat32,positionDeltasFloat32`，同拓扑原源基线。
- `generated/{case}/group-{7,21}.npz`：映后同名位置字段，加 `normalDeltas,baseNormalFloat32,normalDeltasFloat32`；Body 的 delta 数为 0，Face 为 54。
- `generated/{case}/mapped-endpoints.npz`：全端点 `sourceEndpointsM,mappedEndpointsM,float32BakeRoundTripM,sourceJacobians,sourceNormals,mappedNormals,float32NormalBakeRoundTrip,sourceBaselineFloat32M`。Float32 端点按 Float32 base+Float32 delta 相加读回。
- `generated/{case}/known-oh.npz`：全 Face7251 的 `sourceMixedM,sourceMixedBakedM,AEndpointMixM,AEndpointMixBakedM,BSourceMixThenGM,BSourceJacobians,AMinusBM`。

known-oh 真实映射为 happy→4、blink→11、oh→32、EYE_Joy→15，权重 .65/1/.66；仅 Face_SKIN/White/line/lash 负 EYE_Joy −.65。新材质使用点集已核两个 lane 不重叠，无跨消费者静默合并。见 `prepared/known-oh.json`。

A=G(P)+Σw[G(P+D)−G(P)]；B=G(P+ΣwD)，B 是额外实际求值。精确归因使用 sourceMixedM/AEndpointMixM/BSourceMixThenGM。同拓扑烘焙消费对照使用 sourceMixedBakedM/AEndpointMixBakedM，二者是读入 Float32 base/delta 后有序 Float64 加权和，不宣称 GPU 算术精确一致。A−B 是次序差，不能当接触或可见穿透深度。

后续须独立检查完整子片的接触及 parent lineage，不能只用旧 parent pairs 差集消去内部新增边；本包未自造碰撞判定。没有批准导出、全八批产或游戏替换。

## 复现与封包

`prepare.py` 只准备源数组并核前置独审 SHA/status；`run.py --execute-once` 核 execution-spec 后执行，拒覆盖。`readback.py` 只读保存数组。封存目录不可直接再运行；若需另包，需新的授权与身份。`package-files.json` 保存全部实际文件 SHA，包含计算代码、原输入 pin 与后验读回；execution-spec 保执行时原 pin 不变。
