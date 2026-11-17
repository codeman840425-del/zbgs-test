# 原生MToon独立衣装修后同房间回读

固定源码 `fb572c3d39dd8f7caca6202142679654faecff51`，build `86d4da9716a7`。本次只有一个正式v5采集，未改原78912 VRM、三件独立GLB、贴图、绑定、法线或描边宽度。独立检出`experiments/native-material-init-fixed-v1`提供固定dist，注入bundle也从同commit的15个实际源码输入编译并逐Git blob核对。root后续网页构建若变化，应另记录，不能重标这份影片。

原VRM SHA256 `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3`，16,315,696 bytes。三件来自`assets-source/native-vroid-equipment-v1/equipment.json`，所有bindings和compatibleAvatarSha256原样消费。

| 独立资源 | bytes | SHA256 |
| --- | --- | --- |
| native-vroid-78912-top-v1.glb | 778120 | 36c1b6a4d63839e94b21057898f9990b1ce4978a87140b70dcae9a1d779739d9 |
| native-vroid-78912-shorts-v1.glb | 721904 | 12d922ec62cdb530d0dfa2e055e7632fb72c8359a9d3482546eccd7681d3e7c6 |
| native-vroid-78912-shoes-v1.glb | 682856 | 23c16289206c9c62b582921722510ac89b6d6bcd2397594a311494c1092f5243 |

## 实际结果

真实createEquipment加载并提交三件，绑定原VRM自己的raw骨架。只在原衣物三primitive与独立三容器之间切可见性，人体/面部/头发的原可见性保持。没有覆盖身体、无替身，也未移除原几何。

新资源准备后，六个唯一surface/outline材质的alphaTest属性和uniform均为0.5，UV动画时间为0。首次暂停由原衣直接切独立衣，中间不step，每个实际draw读取GPU alphaTest也是0.5。所有8组正侧面配对均核这项，保留真实MToon和描边。新源码在loadOne完成阶段调用官方material.update(0)，无需等待首个动态帧。

已经实际查看4张站立正侧图、3个walk时刻的12张正侧图（通过两张原图缩略对照表）、最后屏图，以及两段纯视频各11个2fps代表帧。未再看到v4首次暂停切入的腿部黑壳、黑领口/下摆或三件丢失。站立正/侧图原与独立解码像素完全相同。walk图每幅差异0–7像素，其中两个配对各有1像素最大通道差55，其余差最多1级，原统计和bbox保留，不把所有图称为逐像素相同。完整indexed顶点world误差最大31.671899nm。抬膝时原短裤本身上拱、衣摆和发尾运动两者均保留，本次不修原造型或另称原动作自然度通过。

## 两段正常速度影片

- `run-1/embedded-1x.webm`，1,023,233 bytes，SHA `034df2dc80cc9bd8caf0cb24b1a904375d928bca060926a1b7c4a072f85756c6`。
- `run-1/independent-1x.webm`，1,015,680 bytes，SHA `0f5bc3232dd2a75bf69b1713ae386a7906721c581e4613916bac7bc2a05d7db1`。

两片由同一WebGL canvas.captureStream和MediaRecorder录制，只在各自首RAF的dt0开始，结束后停止。视频均1040×814、VP9、约29.97fps、媒体时长5.44秒。对应真实RAF区间各5.5026秒、4个phase周期，累计motion时间与wall差约4e-14秒，最大frame delta36.4ms，未受50ms上限截断；媒体首尾帧约63ms差单列，未重定时或加速。两段为分别运行，不宣称逐帧同步。使用共用createMotion的显式treadmill，固定根节点，不验证导航或地面移动路径。

`run-1/normal1x.webm`另为完整Playwright诊断记录，包含加载、暂停配对、瞬时诊断步进及两个实时片段。它不能整体作为纯正常速步行动作片。抽帧判读不等于逐帧视觉验收，未运行所有动作。

## 历史与范围

v1骨名匹配失败、v2 facade/raw adapter调用接线失败、v3首RAF负dt及CSS MIME失败、v4真实首帧材质初始化失败全部保留。v4两次因果检查分别排除仅关outline的修复，并证明只调用官方update(0)即可把JS/GPU alphaTest从0带到0.5且移除黑壳。v5沿已独审时钟和MIME夹具，保首RAF epoch与严格递增timestamp，不用负值clamp掩盖原失败。详见v4/REVIEW.md。

为完整保留鞋尖，v5两套相机共同较v4略放宽和下移，具体position/target记在report，不借旧版本图声称相同相机。原/独立每组始终同姿态、相机和房间灯光。非完整factory接入，未注册新body、不验证配方恢复、独立表情/色层/附件、坐起、跑步或多实例。原许可仍为作者内部技术候选，未借材质修复声称商业分发已获准。

Chrome、MediaRecorder tracks和自管HTTP服务均已关闭，GPU窗口已释放。4196发布由root另行管理，本包只给所测原生资源组合的素材装配和首帧修复证据。

## 复现

在独立检出固定fb572c3d并恢复对应锁定依赖与固定dist后，把本包的capture.cjs和overlay-source.js放到新的同层空输出目录，执行`node <新目录>/capture.cjs --prepare`及`--run`。入口核HEAD/build、五个输入、源码和bundle hash，已有run-1拒覆盖。当前root可能已把原固定树推进网页版本，不能对不匹配检出跳过身份门。无需为本次封包再录。
