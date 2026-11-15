# 同73帧MotionBERT纯pose候选：连续性改善，目标动作适配待验

2026-11-15实际执行两条件、每条件73帧（原138–210，5.755750–8.758750秒），没有扩到720帧。官方固定模型、校验权重、CPU4线程、eval/no_grad、原生flip ensemble。模型加载后两条件forward约0.446/0.301秒，整个进程约4.3秒；这不是目标设备或完整管线性能测试。

## 输入与原样输出

- `inputs.json`保存原33点2D/visibility/presence、原PTS、H36M17映射、两条件模型输入以及原MediaPipe预测world映射17点。原始720帧gzip未改。
- `raw_2d`保原2D语义；`swap_172_173_2d`只对172/173的六对H36M双侧肢体交换数据与置信。未做Z反射、补点或平滑。合成骨盆/颈/脊柱用均值；head明确为双耳中点proxy，不是真实头顶。置信为MediaPipe visibility代理，合成点取贡献点最小值，不能称AlphaPose校准置信。
- `predictions.raw.json`保存两条件各73×17×3原模型输出及逐帧原PTS。遵循官方global推理将首帧root.z设0，其余未后处理。**这是模型归一化3D坐标，不是米制世界点或准确骨旋转。** 不能把它与MediaPipe的预测米直接相减或直接当VRM米坐标。没有标定真实根轨迹、地面或接触。
- `diagnostics.json`完整保留骨长、朝向、髋中心化逐帧跳量及根范围。跨模型跳量按各自整段中位髋–膝–踝长度归一化，单位是“腿长比例”；没有用此比例伪造真实米数。

## 实际数值与失败

| 指标 | 原MediaPipe预测 | MB原2D | MB仅172/173交换 |
| --- | ---: | ---: | ---: |
| 171→172朝向步进 | −173.24° | +13.34° | +6.05° |
| 整段最大朝向步进绝对值 | 173.24° | 26.69° | 29.12° |
| 展开朝向首末差 | 41.40°（中途失效） | 386.69° | 387.24° |
| 整段最大髋中心化点跳/中位腿长 | 0.7702 | 0.1696 | 0.1683 |
| 146→147左腕跳/中位腿长 | 0.6909 | 0.1043 | 0.1060 |
| 左上臂长max/min | 1.862 | **4.434** | **4.351** |
| 左前臂长max/min | 2.504 | 2.009 | 2.020 |

朝向计算沿肩/髋左右轴的固定相机坐标，输出符号与游戏轴尚未独立标定。两候选没有锁成正面：169–175帧预测持续经过背向，与已看原图方向相容；但不构成真实角度验收。高置信语义错输入被时序网络部分抑制，不意味着纠错机制在其他片段可靠。

**明确保留风险：** 两候选第146帧左上臂预测长度分别约0.0598/0.0609模型单位，第153帧约0.2652/0.2648；骨长变化大于原预测。最大剩余点跳位于200→201右腕，约0.17腿长/帧。不能把较平滑的轨迹直接当动作真值。骨长变化本身不证明固定骨长目标动画不可用；现有目标绑定本来应保持目标骨长，需进一步评估方向可靠性。两条件的差异还会传播到输入交换范围外，这是时序上下文影响，不是只有两帧输出改变。

方向检查：146→147左上臂单位方向单帧变化原82.77°，两候选35.50°/37.17°；左前臂最大约32.48°/32.45°（147→148），右前臂约23.96°/23.33°（200→201）。第146帧左上臂长度仅各自中位腿长的0.0826/0.0843，非数学零长，但短段使方向敏感；所有骨方向诊断保留精确零长检测，不能把本风险夸称已检出零骨段。左大腿最大方向步进降到5.07°/4.45°，小腿9.19°/9.07°。这些值支持有界目标骨架回读的进一步判断，不能单独代替观感。

17点无脚尖/脚跟、手掌/手指和骨轴twist；没有恢复根移动、逐脚接触或腕掌方向，没有输出动画或接入男女VRM。本次不再参数扫描、不扩新检测器、不用SMPL。建议把它保留为“时序方法可运行且局部连续性更好”的候选，**尚未升级为已验生产动作**；root可基于完整方向与视觉证据决定是否沿现有normalized合同做同3秒固定目标骨长回读，不因raw长度比单独取消后续适配。

## 可观看对照

`three-condition-skeleton-1x.mp4`同屏三条件，各含XY正投影/ZY侧投影，原速24000/1001fps。解码实际73帧，time_base1/24000、每个PTS恰为k×1001，首末跨度3.003秒；容器包含末帧展示时长约3.044708秒。`movie-timing.json`逐项映射回原PTS，未插帧或改速。骨架为髋中心化/各自中位腿长归一化展示，不应误读为根轨迹复现。

实际查看`skeleton-comparison.png`的146、147、153、171–174、201帧：原模型172/173左右颜色与背向序列不连续，MB两条件颜色顺序较连续；但146肘肩靠近与153明显伸出、171–174手臂贴近躯干的深度/扭转解释仍不唯一。短骨方向变化在固定骨长角色上可能被放大，需角色回读；这是静图观察，不冒称完整真人/目标动画自然度验收。

## 固定来源、环境与复跑

官方[代码revision](https://github.com/Walter0807/MotionBERT/tree/705d3a95354db8bdb696b3492e47a3b5537174ff)，[作者权重文件](https://huggingface.co/walterzhu/MotionBERT/blob/370a9196aa3c89198b134c82476143b01c0fb32c/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin)。Apache-2.0保存在`LICENSE-MotionBERT.txt`，原文件下载路径和SHA在`restore-manifest.json`。权重本地实核64,099,897 bytes，SHA256 `9811155371db4ca5d20f31a36a232d41012e12e1333882888a564d741861148f`，与远端LFS一致；权重和官方源副本留ignored analysis。

独立venv `analysis/motionbert-turn-v1/.venv`使用system-site-packages，**不是完全自包含环境**；继承本机PyTorch2.14.0+cpu/numpy2.4.2，未安装包、未改变MediaPipe锁环境。版本与全部继承包记录在`run.json`，核心版本见`runtime-versions.txt`。模型只导入固定官方DSTformer/drop，flip_data来自固定官方utils_data；薄adapter独立实现文件读写、映射和CPU加载。保官方LayerNorm eps1e-6、严格state_dict加载；仅去除DataParallel键名前缀，weights_only=True成功，无SMPL导入或GPU初始化。

```powershell
# 要求系统已有runtime-versions.txt中的CPU运行依赖；不会自动安装或更新环境。
python -m venv --system-site-packages analysis/motionbert-turn-v1/.venv
python scripts/pose-reference/motionbert_turn.py prepare
.\analysis\motionbert-turn-v1\.venv\Scripts\python.exe scripts/pose-reference/motionbert_turn.py infer
.\analysis\motionbert-turn-v1\.venv\Scripts\python.exe scripts/pose-reference/analyze_motionbert_turn.py
.\analysis\motionbert-turn-v1\.venv\Scripts\python.exe scripts/pose-reference/render_motionbert_turn.py
```

`prepare`复用并核本地权重；缺失时下载固定源。复跑前将要保留的结果单独归档；不将候选写回MediaPipe raw。骨架对照图只用于诊断，不能代替真人原片或男女正常1×验收。
