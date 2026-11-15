# 1a 当前移动操作基线

构建1a0d06fc8ffe，原女性。真实DOM速度按钮（trusted click）+实际房间walkTo目标命令；每个场景只在开始前重置fixture，场景中不注入速度/姿势。四段均正常1×、dynamics ON，room相机位置[5.8,4.5,7.8]/target[0,.65,0]逐帧严格不变；0pageerror/0碰撞。每段保留未剪辑原片与原始帧trace。源快照取固定提交0ae64b83384a3ed9853185f6a008ac6b70b1e8cc，未用开发版替代。

| 场景 | 实测 |
|---|---|
| 静止点常规跑步→目标 | 约2.3ms开始位移，但runMix直到1233.8ms才>0，1531.1ms才全跑。之前是walk源逐步加速。 |
| 稳定走90°改目标 | 无零速、无整段turn planner、无重启；对齐误差<.06rad用485.9ms，转向期间最低.24325m/s。 |
| 稳定跑90°改目标 | 无零速/重启；563.8ms对齐，转向期间最低1.589999m/s，runMix始终1。后续抵达终点减速不计作拐弯站停。 |
| 稳定跑180°重选 | brake约564.2ms，然后零速1091.9ms；请求后1661.7ms重新位移，runMix=0、phase重新约.3；重启又等1231.6ms才混跑，1528.9ms才全跑。 |

时间是实际rAF采样，精度约一帧6.1ms，不是亚毫秒输入保证。四片simulate/wall约.99994–1.0；录像帧耗时只帮助排除这里的秒级停顿来自掉帧，不是目标设备性能验收。walk90和run180片在完成本次拐弯/重启证据后结束，未等待再次到达终点，terminalTarget如实保留。

## 当前根源（不是历史turnLegacy假定）

- `main.setSpeed`只写maxSpeed；按钮“常规跑步”没有行为意图。`simulate`用1.5m/s²加速，把actualSpeed传motion，未传locomotion。
- `motion.update`虽然支持state.locomotion显式run/walk，但房间没使用；故退回actualSpeed>=1.85/<=1.55迟滞，加0.30s源混合。从0加速到1.85约1.233秒与实测一致。
- 默认转向的|angle|>1.75rad触发brake；speed<.06且非moving时angle>.27也进whole-turn。active turn plan每子步强制speed=0/moved=0。旧.65阈值/0.5s settle只在turnLegacy诊断支路，本片turnLegacy=false。
- run180停止时runMix回0、移动恢复走phase约.3；新实际速度再次跨门后才能跑，UI选择仍2.6但意图已丢失。
- 本次稳定90°两例没有复现“必站定”，不能夸大为所有拐角强制停。零速间隔只统计仍有目标时，不混普通终点停止。

## 结论边界

此补验定位当前操作逻辑，不撤销用户对341/13f指定片段的接受。它不是全部转弯、低速新目标或家具路径覆盖。正常原片已保存供观看，本报告的行为结论来自逐帧状态；未把数值或缩略图替代用户自然度验收。
