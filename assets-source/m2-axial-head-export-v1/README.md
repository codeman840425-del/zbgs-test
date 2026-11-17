# 轴向头部导出接缝

本包已执行唯一一次 identity 和通过原 55 状态 strict 的 lean 导出。round 后验存在新增对，导出入口拒绝它，本包没有 round VRM。两个实际文件尚未通过语义、视觉或游戏验收。

输入是原男 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff` 完整 VRM 和已封存的 mapped-endpoints/sourceJacobians。没有重算 G、PCHIP、knots、参数、旧 SLIM 或 cage。只有 jawWidth、cheekWidth、chinLengthM、chinProjectionM 四项头部变化，身体参数未施加。

## 实际结果

| 资源 | 字节 | SHA256 |
| --- | ---: | --- |
| generated/male-axial-head-identity-v1.vrm | 20837212 | 1278357bfd3c0513af67f3e67760ec3d6063baebc1f5305de76d00a4e39041bf |
| generated/male-long-lean-axial-head-v1.vrm | 20841852 | 83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9 |

两资源回读原 binary prefix、原 accessor/view 记录、图片 payload、材质、UV、JOINTS/WEIGHTS、skin、IBM、node、VRM 表达映射、mesh 元数据、原 triangle 顺序及全部共享消费者。15 个 primitive 全部检查，54 个实际 Face target 在 9 个共享消费者中回读，共486个 morph-consumer endpoint。Body 没有 morph，没有补造 target。

identity 原 base 作者 NORMAL 误差为0，54个新 NORMAL delta 全为0。lean 实际 Float32 base+delta POSITION 最大误差为1.1826318473439665e-7 m，NORMAL 向量分量重建的最大欧氏误差为7.541920699186882e-8。全部实际 NORMAL/POSITION 与预期 Float32 编码逐值相同。精确数值见 generated/report.json。

原源着色 N 按现有 `legacy.normal_map` 使用每个 P 和 P+D 各自保存的实际 DG 逆转置传递并保原长度。该原函数的1e-6近identity分支原样保留。没有用新三角面积平均法线替换作者 N。连续映射的法线传递与离散输出三角的几何法线具有不同职责，不能据本次向量回读宣称实际 MToon 光照、轮廓、接触或外观通过。

## 复用与拒绝

`adapter.py` 提取未改的 head-cage `bake` 函数，仅把唯一硬编码 generator 赋值的右侧改为本包方法/spec/请求身份。二进制追加与 morph 差值核心沿原代码。原文件字节 SHA 仍由 spec 核验。

每次创建新的完整 results，导出前严核 base、NORMAL、target 数量、全部共享 NORMAL/target 引用、维度、有限性及完整原 P+D。拒绝被原 bake 写入 accessor cache 的旧 results。prepare 的12项合成检查不调用 bake，覆盖静默 zip 截断、缺组/局部数组、非有限、共享冲突、identity法线及旧方法后验拒绝。

`strict-admission.json` 记录真实 lean 后验通过和 round 后验拒绝。request.json 只选择 lean。原55strict是数值输出端点的后验，本导出接缝没有重新执行相交检查。实际导出 VRM 的独立后验由下一阶段负责。

## 执行身份与重演

最终 spec SHA 为 `d533695d883d73c1c40dc871f2f1347c5467d0f07bfb025712ffe5c25a131a2c`。所有输入路径均为仓库根相对路径，输入与明确脚本清单在 spec.json；prepare 原回执保留在 prepared.json。

实际执行耗时0.6554468 s，递归进程树采样峰值128368640 bytes，2线程子进程。监控使用已有 host Python/psutil7.2.2，数值子进程仍用独立固定 venv。50ms采样可能遗漏瞬时峰值，共享页可能重复计入。上限600s/3GiB，无GPU。

本目录保留首次运行，禁止覆盖重跑。需要独立重演时，在独立检出中将 generated 和 execution 完整移到检出外归档，保原 spec/request/输入 SHA 和脚本不变，再运行同一命令。新 receipt 具有自己的执行身份，不代替原证据。

```powershell
python -B scripts/m2-axial-head-export-v1/run.py --execute-once --request assets-source/m2-axial-head-export-v1/request.json
```

原源资源的许可和来源继续沿其既有记录，本包没有引入第三方素材。输出仍在 assets-source，没有 public 发布、runtime 改动或4196变更。不能把 head-only lean 作为整身体型或完整八预设交付。
