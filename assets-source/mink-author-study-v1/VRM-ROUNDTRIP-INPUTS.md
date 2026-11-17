# 下一次实际 VRM 坐标往返的最小输入

本轮没有转换 VRM。下面是接入方需要冻结的实际数据，供负责人另立一次角色坐标试验。机器人样例及两个滑轨球体没有验证人体 ball/free joint、皮肤或衣物。

| 输入 | 最少内容及用途 |
| --- | --- |
| 实际人物与装备身份 | avatar 文件 SHA/字节、实际 profile、body variant、top/bottom/shoes 等正在穿戴的文件 SHA/fit。身体和各衣物的完整被引用三角、顶点、skin weights、IBM 和所属 mesh node transforms，需要回到真实 LBS 表面验证代理误差 |
| 原始与 normalized 骨架快照 | semantic bone→原始 node ID/name、父子关系、rest local TRS、rest world matrix、normalized bone local/world、两套空间间的实际 offset。另存 actor/model world transform，保原始骨架身份 |
| 轴、单位与四元数合同 | 明确 VRM/Three、MJCF 和游戏地面的米制与坐标轴变换、正反矩阵、手性及 quaternion 顺序。Three 常用 XYZW，MuJoCo qpos 的 quaternion 为 WXYZ，需要实际数据证据核顺序。骨架 rest frame 与 solver joint frame 也须逐项对应 |
| MJCF joint 定义 | 选择并记录每骨自由度、局部轴、rest offset、关节范围及根自由度。区分 qpos 与 tangent velocity 的维度，free joint 为 7/6、ball joint 为 4/3，不能把 QP tangent displacement 当四元数直接相加 |
| 有实际意义的任务点 | 手掌/脚底/视线等 site 的源网格或骨局部 frame，目标世界位置、朝向和接触时段。依实际用途确定作用端，给出目标在 actor/source/world/solver 空间的往返值，避免只用骨偏移猜接触 |
| 碰撞代理和实际 pair | 每个 geom 的源表面、所属刚性 body、rest pose、尺寸与覆盖误差。记录请求 pair、过滤后的实际 pair、源固有接触、允许的有意接触和不允许的碰撞。当前代码会过滤同焊接体和父子配对，需要实际清单 |
| 动作与时间 | 精确 clip SHA、时间数组、根运动合同、原骨姿态与接触窗口。由负责人选未封存的短动作，保封板 30 秒舞。每个目标的时刻、权重和允许偏差要有用途依据 |
| 往返见证 | 在求解前留 rest/identity、已知单骨旋转、已知根平移、一个组合姿态的 VRM→solver→VRM 数据，比较骨世界位置/旋转、手脚 site、实际 LBS 表面。阈值和采用 raw/normalized 路径在新 spec 中明示，禁止用整体偏移掩盖错误 |
| 求解消费及最终回读 | 固定 dt、task weights、joint/velocity/collision limits、无解与拒绝行为。结果若烘焙至现有 normalized motion，需要原输入和 rig/鞋/装备身份，并在同一 mixer/修正链中验证最终结果 |

这批输入只足以开始坐标与关节往返检查。代理碰撞、真实蒙皮/叠穿、脚滑、接触意图与正常速度动作仍分别需要实际角色证据。本轮不注册新 runtime 数据或改变控制器。
