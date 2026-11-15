# 跑步意图独立候选087b4f719f62

基于公开1a源码提交0ae64b83384a3ed9853185f6a008ac6b70b1e8cc，只更换main/motion。当前独立dist保留原1a麦克风，**不含root正在修的腕姿实验**。不覆盖新的live/mic/附件代码。

- 选跑/选走显式传给motion；低实际速度不再自动丢失run意图。
- 已静止且gait<.01的起跑直接idle→jog，经原gait入场混合；没有walk插层。仍匹配实际双足，原手动走跑.30s轨迹匹配保持。
- run意图在零位移期间保持；停止只经原gait淡出到idle。独立run加速度3.4m/s²，世界速度连续；walk1.5、原刹车2.5未改。
- **180仍约1.09秒原地whole-turn，未修此项。** 后续制动弧候选必须另身份，不把这版标转向完全解决。

`portable.patch`仅两个文件局部差异；candidate/base原bytes及manifest供SHA审查。不要整文件覆盖已变更主线：当前共享main/motion就是本候选两局部改动，root已知；若其他人续写则按hunk移植。

恢复：精确检出上述commit，复制candidate两个文件到prototype/src，`cd prototype; npm ci; npm run build`。使用锁定依赖。产物identity应为087b4f719f62；源码copy receipt逐91文件记录见evidence对应目录。build-ID不依赖Git元信息。独立实验本次node_modules是指向相同锁文件依赖安装的junction，不是新npmci重建证明。

实际F/M裤装：直接run/手动互切/stop/180重启4场景+原341相关12场景原阈值全通过；旧1a同run-intent门明确失败3项。完整行数据在evidence压缩保留。四段同room1×新旧片是独立正常录制，不是拼接；retarget采用同世界点，根位置门每帧误差5.1–13.3mm明确量化。未宣称用户自然度验收、目标机性能通过或全服装组合通过。最大raw帧间59.42mm距离60mm门槛余量小，不扩大声称。
