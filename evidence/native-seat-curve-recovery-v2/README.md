# 小角度障碍恢复修正

独审反例成立，v1失败保留：desk左边界x=-.07，起点[-.070001,-1.6]、yaw=.1、speed=.835，目标[-.12,-.6]的直线可行。dcf00bde的真实CharacterScene在10s内1200次碰撞恢复，位置不变。恢复后角度约-.147，小于普通静止转向阈值.27，却大于alongFacing的.06；速度0又导致movingSteering的yawRate=0，于是无法脱离墙边。

只改导航恢复：

- 保持普通转向.27不变；仅recover状态在dist>.10且|angle|>.06时调用现有turn-policy小pivot，准确匹配alongFacing条件。现turn-policy本身支持小角度，不另写旋转器或修改开放空间曲线。
- 记录每次恢复的目标与起点；同目标下一次碰撞若净位移不足既有到达容差.0005m，终止为path-recovery-no-progress。任务明确failed，直接命令回idle，sit释放reservation；显式新go/动作清掉旧恢复记录，允许新请求。不是对有进展路径随意设置重试次数。
- 不改障碍、坐标或人物，不teleport，不关闭碰撞；不改UI。

`scripts/qa-native-seat-curve-recovery-v2.mjs`执行真实class/导航/turn/task/lease。八组检查通过：旧反例1200次重试确证；新direct/task各一次恢复，使用pivot并抵达（task completed）；逐步blocked/lineClear通过。故障注入仅在测试中撤去新对齐条件，验证第二次无进展碰撞终止，direct和task都不会无限重试；直接复核sit终止释放和新显式请求重新准入。原入座、不可达、取消、三种时钟及开放空间960子步逐值不变均通过。另复跑既有端点10项通过，结果写本v2目录，不覆v1。

CPU pose update仍为夹具，不宣称VRM足滑/安全停步自然性通过。此保护解决同目标原地反复veto，不是任意动态障碍全局活性证明。root前次GPU样片不改标签；新候选仍需固定构建复核。

复现：`node scripts/qa-native-seat-curve-recovery-v2.mjs` 和 `node evidence/native-seat-curve-recovery-v2/endpoint-regression.mjs`。运行会写本目录结果，先保原证据。独审原probe与结果仅引用并pin，不改写。
