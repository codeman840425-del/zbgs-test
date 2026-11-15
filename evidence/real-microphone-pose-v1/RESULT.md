# 真人持麦照片识别小验证

2026-11-14。本目录是素材与识别实验，不是已验动作、蒙皮或游戏角色修复。实际使用官方 MediaPipe Tasks、CPU、IMAGE 模式；环境 Python 3.13.11 / mediapipe 1.2.3，模型 SHA 与阈值见 `results/run.json`。

## 实际结果

- `headphones.jpg`：返回 1 组身体 33 点及 2 组手各 21 点。已看原图和 `results/headphones-overlay.jpg`：右手拿麦靠近嘴，手指围住筒身，网罩端朝向嘴；另一只手扶麦架。身体模型却把右腕预测在下方麦架附近，是明显错误，不能直接拿身体腕点驱动持麦。单独 Hands 的右腕在真实持麦处附近，仍未逐关节人工标注精度、不可当抓握旋转真值。
- `stage.jpg`：原图返回 0 身体、0 手；保留空数组及叠图。画面存在暗服装、绿光、局部遮挡、画外下肢和其他人物局部，不单独断言某一项是失败原因。没有降低阈值或补造关键点。
- headphones 身体右腕 normalized `(0.22866,0.67215)`、visibility `0.76236`、presence `0.93144`；独立手模型右腕 `(0.30249,0.37238)`。这说明高 presence/visibility 不等于坐标正确。

## 数据边界

`normalized` 保留原返回 x/y/z/visibility/presence。`world_meters_predicted` 是单目模型预测坐标，不是实测深度、准确人体骨旋转、相机标定或自动蒙皮。图中画外腿仍可能有模型预测，不能视为已观测身体。Hands 每点的 visibility/presence 返回 `null`，没有写 1；handedness score 只表示左右手分类，不能用作关节点准确率。人体和双手也没有擅自融合。

## 来源与使用条件

两图为 Nenad Stojković / Shixart1985，CC BY 2.0；文件页与下载地址、SHA、抓取的页面快照见 `sources.json` / `*-source.html`。展示与派生作品需署名、链接许可并说明改动，不表示摄影者背书。

- [headphones 原文件页](https://commons.wikimedia.org/wiki/File:A_singer_captivates_the_audience_while_holding_a_microphone_and_wearing_headphones.jpg)
- [stage 原文件页](https://commons.wikimedia.org/wiki/File:A_musician_passionately_sings_into_a_microphone_on_stage.jpg)
- [许可](https://creativecommons.org/licenses/by/2.0/)
- [Pose 官方文档](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Python)
- [Hands 官方文档](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Python)

stage 与当前官方缩略图字节相同；headphones 与当前同尺寸缩略图字节不同，不能声称同一下载字节。原已保存文件没有改写，随后实际解码比较：960×1438 RGB 每个像素完全一致，MAE/RMSE=0，见 `headphones-source-pixel-check.json`。

## 复跑

在项目根运行：

```powershell
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/extract.py evidence/real-microphone-pose-v1/headphones.jpg evidence/real-microphone-pose-v1/stage.jpg --out evidence/real-microphone-pose-v1/results-replay
```

失败恢复：先核模型 SHA 与 `requirements.lock.txt`；图片不存在/解码失败应恢复原输入，不补点。API运行错误与“0 检测”分开记录。当前只完成照片识别与缺陷观察；可编辑动作和男女 VRM 正常 1× 回读尚未完成。
