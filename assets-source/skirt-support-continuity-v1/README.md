# 前裙边连续性有界修复

来源为既有m1-skirt.js；没有换引擎、动作、腿映射、速度或碰撞半径。公开152/4194保持不变，f7/4193为用户报告复现版。

实际2.0/2.4m/s最终前边跳125–142mm而原蒙皮约10–13mm，runMix全1。footIK关闭仍147mm。原支撑硬if边界对连续输入不足1纳米变化产生51.922mm输出跳；原横轴在腿接近竖直时方向变化85.244°。

- 7f309caee479只使支撑在原R到1.1R的外沿余量连续消退，内侧完整支持，两腿按较高表面优先的连续覆盖并集组合，保留原max语义。11个实际边界回归通过，但实际三速仍有约133/140mm跳，拒绝；不把数学连续当视觉通过。
- a491efde53fb进一步以实际双UpperLeg关节连线投影到腿轴法平面定义侧向，避免腿轴×世界向上在每次近竖直时退化。实际输入方向变化降到1.204°，三速实际旧故障相位跳量约125→14.74mm、142→17.32mm；仍有全段其他位移和边伸长，完整接触与相关动作回归进行中。不是裙装整体通过。

两变体源文件和manifest保存精确字节。恢复baseCommit4958e6b的prototype，再按replaceOrAdd覆盖两个文件即可；按原build-id算法验证与两份已构建sourceDigest精确一致。固定dist分别在experiments/m1-skirt-support-continuity-v1/dist和experiments/m1-skirt-anatomical-support-v1/dist，不覆盖历史输出。

回归：node scripts/qa-skirt-support-continuity.mjs，读取真实predicate输入与边界fixture。实际三档正常1×与完整时序分别见evidence/front-skirt-{f7bdc3be3de4-repro,7f309caee479,a491efde53fb}。稀疏18点不是全部网格/身体接触证明，重几何检查单独记录。近共线极端侧抬腿的轴fallback不等于任意动作适配通过。
