# 0b749 连续释放候选：同触发正常速度补片

三条录像已完成；全程固定 `0b749501e377`，原女性裙装、动态开启、完整修正、1×播放，pageerror 0。没有写产品源，也未重复真实skin门。本报告仅对应新增录像，已有 contact/state 数值证据保留原文件。

## 精确跑终点再寻路

复用旧7a86/c182同一脚本、路径、UI速度2.4、room与固定诊断近镜头；跑任务实际completed后立即action('sit')，继续.95秒。

| 新片 | wall秒 | sim秒 | sim/wall |
|---|---:|---:|---:|
| snap-normal/room.webm | 5.5572 | 5.4913 | .988142 |
| snap-normal/fixed-diagnostic-close.webm | 1.5895 | 1.5895 | 1.000000 |

对各片命令后 .10–.27秒同一局部窗口，候选 c182 的近片左腕最大单子步11.359mm、最大标量投影骤降6.703mm；新0b近片分别5.858mm与1.119mm。room分别11.382→6.058mm、6.648→1.137mm。**这是不同实际时钟的局部观察，不是同dt/同相位严格数值等价**；详情含每个峰值时刻与dt见 VIDEO-SUMMARY.json。旧7a86走动不执行手投影，不能把其数值更小当作接触已正确。

三版分别保留同视频时间窗 .68–.96秒的17个连续原解码帧，没有补帧。已逐张审看三张三版帧表：新0b左腕回收较分散，没有在这些近图见到大幅反腕、肩部上提或手突然弹离身体；但位置差仍存在，且各独立录像的相位不完全相同。没有将抽帧宣称为正常速度连续观看或用户观感接受。原片可直接1×审查。

## 同镜头完整坐起转舞

`related-video/sit-rise-turn-technical.webm`：坐入、坐稳、起身、360°转身、走到空地、完整7.2秒技术舞、回idle。五项真实请求均completed；wall19.3894秒、sim19.3240秒、比值.996627。完整77张4fps概览7页已逐张审看，未见抽样帧中大幅反腕/抬肩；room角色尺寸不足判断毫米级手部抖动，不能据此消除坐姿阶段新增约4.1mm变化的观感风险。

根已另行发现旧7a86与0b共有起身末refresh(0)约.517m问题；本次0b不含独立ae6修补，不能把旧共有问题归因于连续释放，也不以本片任务completed将其隐去。本轮不据录像宣布整体自然度或发布通过。

## 恢复入口与范围

在仓库根运行：

```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-refresh-v1/dist experiments/hand-scope-worktree-1/qa-snap-video.cjs 0b749501e377 <新输出目录>
node scripts/run-fixed-check.cjs experiments/m1-hand-release-refresh-v1/dist experiments/hand-scope-worktree-1/qa-related-video.cjs 0b749501e377 <另一新输出目录>
python evidence/hand-release-0b749501e377/analyze-video.py
```

既有原片未覆盖，0b新片在本证据目录；旧7a86/c182精确片仍在独立hand-scope-worktree-1/evidence。normal视频、完整轻量trace、identity、任务history均保留，未在录制中跑重几何。所有浏览器、临时服务和FFmpeg已退出。这些录片不是无录制性能或普通PC达标证据。
