# 第一轮工作缓冲候选：暂停、未合主

构建ad0e99f456ee在独立工作树F:/gamemake-forearm-patch/prototype/dist。c9完整固定备份保存在同工作树experiments/forearm-patch/dist-c9f074519f18；旧视频未改。

仅缓存拓扑/index/UV及工作存储。每个simulate子步仍采真实蒙皮全部顶点、重投影，保持80rails、5点alpha、5轮与最终复查；不缓存接触结果。from-c9.patch仅是局部改动，禁止整文件覆盖主线。

build通过；270捕获姿势轮廓/候选顺序/clip/采样位置严格等价，1万退化随机clip、30帧真实Three SkinnedMesh+morph及index/UV失效检查通过。此离线输入是历史固定腰三角，不是新运行完整衣物，不能称实际接触或提速已通过。

可复算：node assets-source/forearm-collision-v2/workspace-candidate/qa-forearm-workspace-equivalence.mjs

尚未做：新候选实际房间270帧lap/authored对照；同条件4组无录制性能；必要正常速复核。用户本轮仅要求整理进度，已暂停，没有启动浏览器。计时入口已能核指定构建；复工须使用ad0e99实际ID，不继承c9通过或数值。

## 已复工完成实测

以RESULT-ad0e99.md和status.json为当前状态：270×2实际姿态严格等价、4组成本有收益但仍未达标、1×片已保存；未合主。此前暂停/待测段为过程记录，不能覆盖当前结果。
