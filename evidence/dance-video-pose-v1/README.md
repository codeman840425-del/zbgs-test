# 单段真人舞片检测输入：Pexels 5359146

已实际用现有 OpenCV + MediaPipe Tasks + PyAV 管线运行原 `[0,30)` 秒：720/720 帧有人体输出，CPU 28.46秒。**这只是检测输入完成，身体语义连续性、腕掌、全身位移重定向和男女角色动作均未通过。** 不能把深蹲旧样板作为舞蹈通过。

## 来源与保留范围

[Young Woman Dancing and Lip Synching](https://www.pexels.com/video/young-woman-dancing-and-lip-synching-5359146/)，Sergey Makashin / Pexels，使用 [Pexels License](https://www.pexels.com/license/)，不是CC0。原视频仅内部制作参考，不作为原库存媒体分发，不表示摄影者/人物背书；本流程不训练模型。

原文件 `analysis/dance-reference-v1/5359146-original.mp4`（ignored），41,435,980 bytes，SHA256 `c26ca0a91f8b735c575a142a75504696609bfa024e905b9cec13ba61c70c1c48`。原片、原帧、手部ROI、接触表和叠图均只留在 ignored analysis；本目录可备份元数据、原始关键点gzip与诊断，不放原片或叠图视频。

实际解码729帧；选择0–719共720帧，原PTS `0..719719`、time_base `1/24000`、平均帧率 `24000/1001`，末选择样本 `29.988291666666665s`。9帧范围外素材仍在原片中，本次未推理或借作上下文；不得把末样本拉伸为30秒或假定900原帧。源数据与逐帧时间表见 `source.json` / `source-frame-times.json`。

推理前实际查看了6张逐帧缩略接触表，覆盖720/720原帧，单格160×90；完整身体在框，单人、交叉步、侧移及短转身，无明显切镜。黑色宽松裤、头发、交叉肢体和手部运动模糊保留为风险。缩略图覆盖不等于全分辨率精度或连续正常速度观感验收。

## 原始接口，不与过滤结果混写

`sequence.raw.json.gz` 解压后就是原始 `sequence.json`，未补点、平滑、IK、左右改名或融合手/身体。快照压缩SHA及解压SHA见 `summary.json`；gzip mtime固定0。恢复骨骼制作输入无需重跑推理。

- `frames[i]` 保留 source_frame_index、整数pts、有理数time_base、source_seconds、clip_seconds、实际传Tasks的毫秒时间戳。
- `poses[0].normalized` / `world_meters_predicted` 各33点，名称在 `metadata.pose_names`；原样保留 x/y/z/visibility/presence。
- `hands[]` 每项有21点、预测世界点及 handedness。未提供的每关节置信字段为null；左右分类score不是关节点精度。
- 原3840×2160按固定1/3缩为1280×720，OpenCV INTER_AREA，没有裁图或镜像。`metadata.inputs[0].rescale`保存映射，原图像素为`(x*3840,y*2160)`。
- body world是每帧髋中心单目预测坐标，不含真实全局根轨迹，也不是准确骨旋转。源舞有侧移/转身，后续不能固定全局根位置后宣称完整复现。保留当前男女VRM身份证与原蒙皮，不重新自动蒙皮。

## 已知失败与诊断

Hands：633帧0手、84帧1手、3帧2手；第58帧返回重复左右标签。身体左/右腕分别135/62帧visibility<0.5，左/右肘125/52帧。`quality-flags.json`仅诊断标记，不删除原始帧。

**171→172帧（7.132125→7.173833秒）存在身体语义跳。** 实际看两帧大图，人物仍背向，肩/髋的模型左右标签却突然互换，相关visibility约0.999。鼻预测world跳0.59656m；肩约0.35m、腕0.39/0.51m、髋约0.15m、膝约0.21m、踝约0.22–0.25m同时跳，见 `critical-turn-jumps.json`。这不是只需要平滑鼻点的局部问题。

纯离线两种命名配对：五组2D平均RMS原0.06653→交换0.01601；world RMS肩0.356→0.221m、髋0.150→0.020m、腕0.454→0.364m、膝0.213→0.089m、踝0.239→0.072m。鼻z `+0.248→−0.337m`不因左右交换改变。**只交换标签不足以解释剩余深度/朝向跳变。** 原始数据没有被更正。`critical-turn-pairing.json`保存残差、原分量及诊断候选169–175帧窗口；该窗口不是已批准的修复区间。

补看169–175原图：七帧连续背向，173/174也显示后背，头发和步移连续，无真实前后瞬时翻面。此观察支持172/173预测朝向失效，但不证明具体Z反射能恢复真实深度；任何修正须另存带推断标记的候选。原图接触表留在ignored analysis，观察见 `turn-source-observation.json`。

## 六帧手部ROI有界对照

已完成第29、119、299、479、599、719帧，先看原图/裁框再推理。三种条件均为官方Hands IMAGE模式、相同0.5阈值：整帧1280×720、原图腕周围512×512、相同裁框缩为171×171。既有VIDEO结果仅作参考，不能混为受控IMAGE基线。裁框由原始身体腕点决定，未按结果手动重定位；完整映射和原始输出见 `hand-roi-inputs.json`、`hand-roi-results.raw.json`。

| 原帧 | 整帧检出 | 512 ROI左/右 | 171 ROI左/右 |
| --- | --- | --- | --- |
| 29 | 0 | 1/1 | 1/1 |
| 119 | 0 | 1/1 | 1/1 |
| 299 | 0 | 0/1 | 0/1 |
| 479 | 0 | 1/1 | 1/2 |
| 599 | 0 | 1/0 | 1/0 |
| 719 | 0 | 1/1 | 1/1 |

两种ROI分辨率均在10/12裁框检出；第299帧左手被脸发遮挡、第599帧右ROI缺完整手，保持缺失。第479帧右侧低分辨率ROI的第二个检测对应裁框边缘另一个部分可见手，不能直接称为已证假阳性；它暴露手与目标腕的关联歧义。多数检出腕掌落在可见手附近只是定性观察，不是精度或手指验收。

结果支持裁框取景/手的相对尺度改善检出，**未证明原4K细节优于相同视野171像素，也不能把原因仅归为像素不足**。没有扩全720帧ROI；原始序列未融合或更正。遮挡、模糊、左右及目标手关联仍需拒绝或显式fallback。结论与完整性核验见 `hand-roi-summary.json`。

## 复跑

使用 `scripts/pose-reference/requirements.lock.txt` 的已锁环境和 `model-sources.json` 的模型。未安装另一套工具链。

```powershell
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/prepare_dance.py
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/extract.py analysis/dance-reference-v1/5359146-original.mp4 --video --start 0 --end 30 --max-width 1280 --out analysis/dance-reference-v1/results
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/summarize_dance.py
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/diagnose_turn_pairing.py
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/hand_roi_control.py prepare
# 实际查看原图与裁框，记录遮挡/不完整手，再运行infer。
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/hand_roi_control.py infer
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/summarize_hand_roi.py
```

`prepare_dance.py`有原文件就核SHA复用；缺失时从顾问供稿路径或记录的官方固定URL恢复到ignored analysis。模型仍按固定源/SHA恢复，venv与weights不入证据。重跑前将需保留的候选结果另命名，不把过滤候选写进raw快照。
