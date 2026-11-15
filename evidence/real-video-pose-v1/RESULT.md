# 短真人视频 → 连续关键点，当前交接状态

2026-11-14。OpenCV + 官方 MediaPipe Tasks CPU VIDEO + PyAV 保留原 PTS 的检测阶段已实际跑通：处理 240 帧，运行约 9.26 秒，全部返回身体 33 点。此目录记录检测输入与结果；后续 root 已在游戏 `5d848494cce5` 实际回读男女角色，但当前左臂仍有错误，角色脚底接触尚未验收，不是动作或自动蒙皮通过。

## 选用来源

**唯一当前资产清单为 [dvids-squat-source.json](dvids-squat-source.json)。`source.json` 是已拒旧 CRiles23 素材清单，不能作为本次交付来源。** [观看入口](index.html) 提供真人源片与叠图共同 1× 播放，以及男女实际回读录像。

[DVIDS Body Weight Squat](https://www.dvidshub.net/video/517502/body-weight-squat)，2017，US Marine Corps，说明署名 Cpl. Amber Jennings、发布人 Joshua Pena。页面标示 Public Domain；[使用条件](https://www.dvidshub.net/about/copyright)要求不得表示官方背书，肖像、商标权不因公开发布自动放弃。仅作个人内部动作实验。下载页面公开 1024×576 MP4，原文件 SHA256 `05b5870da6ebc66abcfd5715a2864e21299d176dc2c87524d3f5904c37450f66`；完整页面与条件快照、下载地址保存在 `dvids-squat-source.json` / HTML。

The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.

前两个 Commons 候选已保留但未用于最终提取：CRiles23 的 54 秒片多切镜/局部特写；FitnessScape 的 7 秒片双脚出画并有杠铃/字幕遮挡。详见 `rejected-sources.json`，不得将其许可与本次选用片混写。

## 时间与接口

- 请求原片 `[15,23)` 秒；实际帧 450–689，240 帧，首/末源 PTS `450450` / `689689`，time_base `1/30000`。
- 首/末源时间 `15.015` / `22.989633333333334` 秒，固定帧间 `1001/30000` 秒，正常速率 `30000/1001`。没有按 30fps 重采样或变速，没有空间裁剪。
- `results/sequence.json` → `frames[i].poses[0].normalized` 及 `.world_meters_predicted` 是 33 点数组，名称映射在 `metadata.pose_names`。每点原样保留 x/y/z/visibility/presence。
- 每帧保留 source_frame_index、整数 pts、有理数 time_base、source_seconds、clip_seconds、实际送入 Tasks 的四舍五入毫秒 timestamp。`clip_seconds = source_seconds - 15.015`。
- `hands[]` 保留各手 21 点、预测世界点与左右分类。没有融合到身体腕，也没有把分类得分当关节点置信度；每点未提供的分数为 null。
- 身体 world 是每帧以髋为中心的单目预测米制坐标，**不含真实全局根位移**。图像坐标 x 向右、y 向下，z 为相对预测深度；转换到 VRM 应实际检查轴向、左右与前后，不能当作准确骨旋转。深蹲必须另处理根高度/足底接触，不能只转骨却固定髋。

## 观察与缺陷

已看全段约 3.75fps 的 30 格概览：单人、固定镜头、完整身体与双脚在画内，含站立→下蹲→站立两次。未将概览检查宣称连续自然度验收；原片完整 1× 文件可直接查看。

- 240/240 帧有人体；169 帧双手、71 帧仅单手。左肘 52 帧、左腕 50 帧 visibility <0.5。远侧手臂遮挡时不可宣称稳定抓握追踪。
- 预测 world 最大单帧跳变 **0.124053m**，为左脚尖，原 `20.3203→20.3536667s`；单帧约 33ms。归一化图像 XY 最大跳变 0.032463。不能凭零丢帧或 VIDEO 模式名称宣布时序精度通过。
- 预测左大腿长度在 0.2933–0.4271m 间变化，右大腿 0.3175–0.4091m。真实骨不如此伸缩；这些是模型误差/单目不确定性，后续必须固定目标骨长并检查接触与旋转，不能逐帧伸缩目标骨骼。
- 没有真值标注、相机标定、独立跟踪ID检验，没有平滑、补点、IK、脚锁或骨骼动作输出。未新训模型。

## 可观看文件与复跑

- `source-clip-1x.mp4`：完整原图像、静音、正常 1×。
- `overlay-clip-1x.mp4`：同段关键点叠图，顶部48px图例覆盖部分画面，仅诊断。
- 两个 MP4 实际解码均 240 帧，PTS 相对原序列最大误差 `2.22e-15s`（浮点表示量级）；无变速。哈希与统计在 `temporal-summary.json`。
- 复跑入口 `scripts/pose-reference/README.md`、`extract.py`、`review_video.py`；依赖锁、模型固定源/哈希都已保存。

后续集成现场：root 已沿现有动作管线在 `5d848494cce5` 实际回读男女，录像位于 `../video-motion-room-5d848494cce5/female.webm` 与 `male.webm`；前约0.5秒待机、原节奏约8秒动作后回待机。观看页链接原文件，没有复制或改时序；游戏录像未与源片精确同步。下一门仍是修正当前左臂错误并验证男女完整动作、重心和足底接触。保留原角色蒙皮；关键点推理不能代替人体骨架适配和视觉验收。

## 同屏观看页检查

`index.html` 已实际浏览器验证共同1×播放、暂停、拖动至3.500秒及完整重播；最终两片时间8.008/8.007999秒、速率均1、均暂停，pageerror=0。首轮发现叠图先结束会让源片提前约72ms停止，已改为以源片结束为准，首轮失败结果仍留 `index-qa/initial-check.json`，修后结果见 `final-check.json`。12个本地链接均HTTP200；1440px与390px截图已看/保存，窄屏scrollWidth=390无水平溢出。此项是观看页功能检查，不是角色动作、普通电脑性能或同步逐帧精度验收。
