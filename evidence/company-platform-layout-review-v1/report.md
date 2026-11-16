# 公司首包独立 CPU 审查

结果为 passed，17/17 项通过。

参考来自固定提交 af47b6a7ff37d542bfb1b55247a923d7f98cf4a9 的 prototype/src/main.js 第55–188行，直接执行原程序几何构造。
采用真实 Three.js r187，在相同0.47m座高下独立比较，期望值未读取新资源数据生成。

- 69个网格的几何参数与缓冲摘要、材质、世界矩阵、阴影标志一致。数值描述按1e-11精度归一。
- 标签绘制命令与纹理元数据一致。Canvas替身未实际光栅化文字。
- 地板引用射线命中及墙引用通过，四个原始导航障碍保留。
- room-a与room-b仅改变椅子空间变换，椅子局部几何一致，目标数学与世界几何随动。
- 椅障碍对象允许main既有refreshChair原位更新。
- 未知布局及七类基本坏数据在加入world前拒绝。坏数据仅临时改模块内存对象，每例finally恢复，未改配置文件。

legacy初始Z为0.89，实际开场仍由1.05-seatBack校准。room-a固定Z为0.8556601197384992，room-b为[2,0,0]/yaw=-PI/2。

本证据仅覆盖CPU Three场景结构。浏览器、GPU画面、真实男女动作、性能和人类视觉验收均未由本审查建立。
本次未独立核验provider运行配置或桌面Hook拦截。三份实际输入SHA及逐项结果见report.json。

复跑命令为 node scripts/company-platform/review-room.mjs。
