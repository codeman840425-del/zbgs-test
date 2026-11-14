# 当前动作来源与重定向

正式样板使用 **Quaternius Universal Animation Library Standard，CC0**。展示角色仍是 pixiv VRM 二次元样例，动画源的 Mannequin 不加入游戏场景。

- 官方来源：[Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library)；免费 Standard 包，共 43 条动画。
- 原始许可：`prototype/licenses/quaternius-CC0.txt`。
- 本地源：`prototype/public/assets/motion/UAL1_Standard.glb`；可重复下载脚本：`scripts/fetch-animations.py`。
- 实际使用六条动画：`Walk_Loop`、`Idle_Loop`、`Dance_Loop`、`Sitting_Enter`、`Sitting_Exit`、`Sitting_Idle_Loop`。
- 重定向方法参考：[pixiv/three-vrm loadMixamoAnimation.js](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm/examples/humanoidAnimation/loadMixamoAnimation.js)，采用其 rest-world rotation 转换方法；本项目增加 glTF 世界坐标处理、Quaternius 骨名映射和源/目标朝向对齐。

`motion-source.js` 将源骨动画转换至 normalized humanoid。位置轨道仅保留髋部，避免改变 VRM 骨长。路径逻辑独占世界位移，Walk 轨道中的线性行进量被去除；髋部起伏和摆动保留。时间由实际累计距离驱动；步幅从重定向后的脚前后轨迹校准，站立与行走权重渐变。支撑脚用末端 IK 保持世界锚点，膝盖方向取自源动画；转角按可达范围适量降低骨盆，不拖移已落地的脚。

坐下、起身和舞蹈身体姿态都来自 CC0 原动画。坐姿按角色骨架及实际椅面补偿骨盆和双脚位置。360° 原地转身的交替小步仍为本项目新制控制，不冒充动作库中的转身动作。

此前检查过的 RobotExpressive/Soldier 只保留为隔离分析；它们不是当前游戏角色或发布动作来源。尤其不能把 Mixamo 动作误标为 Three.js MIT 代码许可。

重定向成功不等于观感通过；查看完整循环、侧面肘膝、脚底与家具接触，仍是验收的一部分。
