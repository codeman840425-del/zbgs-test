# 原男性 VRM → Mink/MuJoCo → VRM 坐标往返前置

**实际完成一次静止、零动作和单骨旋转往返，全部通过冻结误差门。不是 IK、动作自适应、碰撞或衣物通过。** 没有调用 `solve_ik`、动力学 step、viewer、浏览器或 GPU，没有改变运行时/4196、封存舞蹈或角色资源。

## 身份与实际范围

- 原人物：`foundationProfile('male')` / `beta-base-male-m1b`，`prototype/public/assets/foundation/base-male-roundtrip.vrm`，SHA256 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`；非怪异派生预设。
- 沿用 `scripts/video-motion/export-target-rigs.mjs` 的 CPU 材质移除加载方法：只在内存复制 JSON 后删材质/贴图引用，原文件字节不变；使用项目真实 Three r187、three-vrm 3.5.5 loader 和 humanoid.update。
- 保全 69 个原 glTF node 的 JSON、父子关系、TRS/矩阵、皮肤 IBM 和实际运行 rest；保全 54 个 normalized semantic 骨骼快照。求值域为 hips/spine/chest/upperChest 与双侧 Shoulder/UpperArm/LowerArm/Hand，共 12 个骨骼。
- 本包没有加载独立衣服/鞋、mesh 碰撞代理或蒙皮表面测量；固定裸骨架坐标前置不继承装备 fit 结论。
- Mink 源为作者已核 `5f800f0a369d05bab88b5e5582cf95122d3b82a5`，由既有独立 venv + 指向源码的 PYTHONPATH 等价 sys.path 插入导入，`MINK_DISABLE_NATIVE=1`。执行前重核既有 receipt 的全部 67 个源文件；spec 锁定所用 Python 源与项目库/脚本/VRM 哈希。MuJoCo 3.10.0，NumPy 2.5.5；完整安装锁复用 `assets-source/mink-author-study-v1/requirements-lock.txt`。

## 坐标合同与实际计算

1. 加载原 VRM 后仅一次 `VRMUtils.rotateVRM0(vrm)`；模型 actor 外层为 identity。Three world 为米制、+Y 向上，既有 source 约定展示前方 +Z。保存实际 scene/normalized anchor world matrix，未以猜测的零旋转替代。
2. 求解器 world 用右手旋转 `C(x,y,z)=(x,-z,y)`，det(C)=1；Three +Y 映至 MuJoCo +Z，Three +Z 映至 MuJoCo −Y。正反矩阵均落盘。
3. MJCF 固定 anchor 为 `C·T_anchor`；子 body 保留原 normalized rest local position/quaternion，**不再对每层局部坐标重复施加 C**。每个 body 的 ball qpos 为 `Q_rest⁻¹·Q_normalized_absolute`。Three 采用 XYZW，MJCF/qpos 为 WXYZ。
4. 12 个 ball 关节使 `nq=48/nv=36`；根固定，无 free joint。关节不限位仅为坐标载体，不是人体自由度/限位方案。每 body 人为 inertial mass=1、diaginertia=.001 仅满足模型编译，未拟合人体动力学、未运行动态仿真。`ngeom=0`，没有人为设置避障目标。
5. `mink.Configuration.update(qpos)` 真正计算 FK，读 `data.xpos/xmat` 及 Mink `get_transform_frame_to_world`。将实际输出世界坐标通过 C⁻¹还原，再由父子世界 frame 反算 normalized local；**没有直接把输入 qpos 当往返输出**。
6. 重新加载同一原 VRM，使用反算得到的 normalized local quaternion，调用现有 `humanoid.update()` 恢复 raw rig；与独立原输入姿态的全部 69 个原 node 世界位置/旋转/矩阵及父关系比较。局部位置不允许改写或补偿；反算的位置残差单独核门。

原版 normalized→raw 转换由 three-vrm 自身执行，保留其捕获的 raw rest rotation/parent rotation，不手写替代控制器。MuJoCo 的 ball quaternion 为相对参考姿态旋转，其 qpos 与切空间速度维度不同；本包未积分任何速度。[MuJoCo joint 定义](https://mujoco.readthedocs.io/en/stable/XMLreference.html#body-joint)、[作者 Configuration 源码](https://github.com/kevinzakka/mink/blob/5f800f0a369d05bab88b5e5582cf95122d3b82a5/src/mink/configuration.py)

## 冻结测试与结果

spec 在求值前冻结位置门 `0.00001 mm`、旋转门 `1e-8 rad`。这两个门只针对数值坐标往返，不作为人体接触或视觉门。

| 状态 | 实际输入 | FK 世界最大位置误差 | 重新加载 VRM 后全部原 node 最大位置误差 |
|---|---|---:|---:|
| rest | 原 normalized rest | 3.141e-13 mm | 4.518e-13 mm |
| zero-action | resetNormalizedPose + humanoid.update | 3.141e-13 mm | 4.518e-13 mm |
| 单骨旋转 | leftUpperArm 的 normalized 局部 +Z 轴 30°，其他骨 rest | 3.141e-13 mm | 4.518e-13 mm |

FK 最大角误差 `2.220e-16 rad`；VRM raw replay 最大角误差 `4.441e-16 rad`；全部 69 node 世界矩阵最大元素误差 `4.441e-16`；源 rest 与零动作位置完全相同。左腕实际位移 **242.126585 mm**，不是只检查不动的 identity。

`verify_arrays.py` 是另一个只读算术实现，不导入 Three/MuJoCo/Mink：由原 glTF JSON 重建完整父子矩阵、用 Rodrigues 解析旋转重算肩肘腕的单骨见证，再从保存的 WXYZ 与 C 独立核回世界 frame。解析单骨位置误差 0；不声称它是另一位 agent 的独立审计。

唯一三阶段执行总约 **9.33 秒**，进程树采样 RSS 峰值 **124,751,872 bytes（约119 MiB）**，环境线程设为2。耗时与采样内存不代表普通电脑动作求解性能。原结果和执行日志已保留，没有改参数重跑。

## 可重复入口与产物

在具备 spec 对应依赖的隔离检出中，输出文件尚不存在时执行：

```powershell
python assets-source/vrm-mink-roundtrip-v1/run.py
python assets-source/vrm-mink-roundtrip-v1/verify_arrays.py
```

runner 拒绝覆盖已有 spec/evidence，单阶段失败立即停止；120秒/2GiB/2线程预算。复现应使用新隔离目录中的同源输入，不删除或覆写已封证据。

- `spec.json`：事前合同、原 source 与代码依赖哈希。
- `source-rig.json`：69 源 node、54 normalized、IBM、真实 anchor、3 个参考姿态。
- `male-arm-chain.xml`：可重建的实际 MJCF。
- `solver-roundtrip.json`：实际 qpos、joint地址/nq/nv、FK frame、逐骨误差、反算局部变换。
- `runtime-replay.json`：重新加载原 VRM 后全部原节点/normalized 回读与误差。
- `evidence/vrm-mink-roundtrip-v1/{01,02,03}.log`、`execution.json`：原始执行/费用。
- `evidence/vrm-mink-roundtrip-v1/array-readback.json`：原树/解析旋转/WXYZ 算术见证。
- `package-files.json`：最后封包的输入脚本/输出清单哈希，不含自身。

## 尚未取得的证据

没有 free-root 平移/转体、组合姿态或整段时间序列，未烘焙 normalized motion clip，也未走 AnimationMixer/运行控制器。没有人体关节范围、速度/加速度、手掌用途 site、衣物碰撞代理、实际 LBS 表面接触或正常速度观看。因此下一步短动作仍需其固定动作/装备/site/限位/碰撞输入，不能以这个前置回答“舞蹈关节已自动避碰”。

Mink 与 MuJoCo 为 Apache-2.0，相关依赖许可仍依既有作者学习包记录；本包不含示例机器人网格，不将工具随浏览器分发。原 VRM 来源许可保持原记录。本次只对原男性局部骨架的表示接缝得到实际成功，不扩大为任意体型/完整人物生产能力。
