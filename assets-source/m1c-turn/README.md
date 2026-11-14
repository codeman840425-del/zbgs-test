# UAL 转向源材盘点

本目录目前是源素材审查，**没有已通过的 turn 动作，也没有修改运行时**。

复跑：`python scripts/m1c/audit-turn-sources.py`。依赖沿用 `scripts/qa-m1c-requirements.txt`。输入为已存固定 `analysis/assets/UAL-Standard.zip`；缺失时用 `scripts/fetch-animations.py --archive-output analysis/assets/UAL-Standard.zip` 恢复。脚本核对 ZIP 和 no-root/RM GLB SHA，复用现有离线 glTF 解析器，完整求值父节点 TRS。60 Hz 包含首尾，真实鞋蒙皮取同侧 foot/ball 权重不少于 0.5 的顶点，各 105 点。

`ual-source-audit.json` 包含 43 段动作的根位移、髋朝向、足轨和 ZIP 内许可全文；`ual-source-trajectories.npz` 保存八段代表动作的连续踝位、鞋底最低点、髋位和朝向。它们是源侧数值证据，不是当前 VRM 的视觉验收。

## 素材事实

固定 Standard ZIP SHA256：`cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`。no-root GLB：`69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`；RM GLB：`be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01`。Quaternius CC0，来源说明见 `docs/ASSETS.md`。免费包有 FBX/GLB 和 root-motion 对照，没有取得作者 `.blend` 工程或付费 Source 包。

骨架为 UAL1：`root → pelvis → thigh_l/r → calf_l/r → foot_l/r → ball_l/r`。root 本地有 X −90° 的坐标转换；完整世界求值后 +Y 向上、+Z 向前，静态髋高 0.9167 m。朝向采用双髋横向轴叉乘世界 +Y，不把 pelvis 本地 Euler 当角色朝向。单位是源角色米制尺寸，不能直接作为男女 VRM 的尺寸。

| 源 clip | 实际轨迹 | 转向用途判断 |
| --- | --- | --- |
| Idle_Loop，2.5 s | 髋横向范围 7.8 mm；双踝近乎不动；髋朝向固定 −13.3° | 可作源姿和呼吸参考，不是重心换脚 |
| Dance_Loop，1 s | 髋横向 143.6 mm、朝向 −18.5° 至 +18.5°；双踝 X/Z 范围小于 1 mm，双鞋最低点全程在地面约 1.3 mm 内 | 扭胯摆动，未发生转向落脚；不能按“舞蹈”名称推定可复用 turn |
| Walk_Loop / Walk_Formal_Loop，1.333 s | RM 前进 1.3 m；髋朝向仅 ±2°；踝前后范围约 0.64 m，鞋底实际抬升约 97 mm | 可借摆腿和支撑时相；必须重新适配转向脚轨，不直接旋转整个步态冒充转身 |
| Punch_Cross，1 s | 右踝横向 110 mm、前后 40 mm，髋最终恢复原朝向 | 出拳时的足部调整；不是完整转向源，不直接移植攻击上身 |
| Sword_Attack，1.533 s | 髋朝向 −32.3° 至 +46.3°但净变化约零；RM 前冲 1.501 m | 含大幅前冲和攻击姿态，不适合原地转身 |
| Spell_Simple_Enter，0.533 s | 髋转约 −27.5°、双踝不动 | 躯干扭转，缺少必要支撑换脚；不能用作脚跟转身 |

43 段中没有发现完整、可直接复用的站立转向片段。近地比率是几何估计，没有作者提供的接触/受力标记；源 Walk 最低点可低于零，不能把这个探针当真实地面接触已通过。

## 最小新制源样件建议（尚未制作）

保留 UAL Idle 的上身参考和已验证的骨架语义，借 Walk 的摆腿弧线制作明确标注的新制转向支撑序列。整个动作使用连续的重心转移和全段 yaw 速度曲线；落脚事件根据支撑/可达范围确定，不按固定 30° 重置 easing。导出局部骨轨、可编辑参数与 contact/yaw 参考曲线；运行时 root yaw/pivot 由一个控制者独占，导出不再叠加世界位移。先做单个代表方向/角度，目标角色真实鞋接触、膝盖与连续正常速画面通过后，再决定可否参数化。

当前负责人正独立修复控制器的持续转向和 foot pivot，避免同时引入第二套根轨。源样件需与这项接口统一后制作；本目录不把方案写作已实现。
