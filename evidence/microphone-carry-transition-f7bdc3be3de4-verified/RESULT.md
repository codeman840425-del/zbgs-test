# Carry→talk 定向数学回归

源 helper 4d2ee0fd、fit d75b0081、live 3a790c82 精确哈希见 report.json。固定 f7bdc3be3de4 的男女 carry 侧面原图已独立看过：掌和前臂顺接，旧低腕固定麦轴造成的大折腕已不见；这里只是静态观察，正常速度形态仍由完整原片判断。

原 VRM 掌长轴经精确 grip 反变换均是 mic +X。v4 由肘→腕作 X，up 投影到 X 垂面作 Y，再由刚性 grip 解手旋转，因此中立掌轴是直接几何结果。未改指姿、未翻肘 pole。

实际原 F/M 骨架/握姿加载，241 个等间隔 blend 样本、240 步120Hz carry→talk→carry，与0/±90/180度朝向对照：全部可达/有限，carry0度，最大中间腕角 F12.6014/M7.86374度均不超过 talk 端点，朝向等变位置误差<4.90e-16m。它们取源静止骨架，因此不应与实际 idle/sit 作者姿态静态9–16度混为同一数据。

真实 damp(rate10) 第一帧转换最大腕步长 F18.46/M21.81mm、肘12.57/17.87mm、手旋转6.08/6.11度（120Hz）。这是操作切换的峰值，未设审美通过阈值；完整正常录像还需判断动作速度。数学中间值连续不等于自然动作通过。

边界：forearm 若严格平行 up，carry投影无稳定方向；当前两个原体目标不触发，不能将当前结果推广任意姿态。未测 holdWeight 装卸混合、live之后完整皮肤、动态嘴/肩、坐姿作者骨架、任意派生体与麦头遮脸。

执行：`node scripts/qa-microphone-carry-transition.mjs <全新输出目录>`。使用仓库锁定 Node依赖及实际 VRM；产品源码不修改，源快照和脚本存此目录。首次报告另目录保留并标 INVALID：male 子串误匹配 female；最终改为精确ID并增加 grip/body SHA相等门，只有本 verified 目录用于结论。
