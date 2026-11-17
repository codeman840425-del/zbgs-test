# 原生 VRoid 2.16 候选房间技术观察

2026-11-17。实际使用 VRM1 `female-native-round-waist-216.vrm`，SHA256 `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3`，16,315,696 bytes。原生 `.vroid` SHA256 `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de`。2.14 参数读回仅保为前序来源，升级后的参数未重新逐项读回。

固定房间 build `83decd027116`，源码 `bfde7d79bc6bce4eda42d3d06d870364f3f64818`。实际执行入口为 `scripts/qa-native-vroid-study.cjs`，精确执行副本、bundle 和请求保存在 `run-1/`。原4196服务、生产控制器与资源未改。

## 实际运行

候选由真实 GLTFLoader/VRMLoaderPlugin 加载，通过固定版本 `loadRetargetedMotions` 和 `createMotion` 驱动自己的 normalized 骨架，逐帧执行自身 `vrm.update`。原女性主实例保留但隐藏，Phaser 原实例任务提供根节点行走轨迹，候选跟随该根变换。所有原生内嵌服装和长发保留。

站立后请求走到 `(-1.4,-0.6)`，任务 completed。候选根位置从 `[-0.5,0,1.15]` 到 `[-1.392373172972833,0,-0.585170058558286]`。共有67个100ms量级采样，其中23个moving，站立/行走结束更新数257/886，pageerror和候选tickError均无。记录中的最大 peakSlip 为1.968530mm，reachClamp为0，这些是本次共用动作模块指标，尚不构成动作观感验收或普通机性能结果。

VRM metaVersion为1，retarget ratio为0.9905936673。可见原始rest bounds高1.612330873m。未提供显式脚底数据，使用可见rest最低点 `-0.000000844951m` 一次校准；实际鞋底语义还需完整factory准入核验。左右鞋均通过既有名称语义选中300点，foreign计数0。候选场景独立处理VRM0旋转规则，没有复制原VRM0场景四元数。

## 实际查看

已查看 `run-1/` 的全部7张截图，以及 `filmstrip/000.jpg` 和 `001.jpg` 覆盖正常速度录像0–10.5秒的22个2fps代表帧。前段包含加载及原角色显示，约3.5秒开始出现新候选。站立、行进、到达均可见，未见明显反向行走、整肢脱离或模型爆开。人物在房间镜头中较小、裤腿/肤色较浅，不能凭这些帧排除细小穿插、滑步、鞋底接触或发片交叉。保存的 `run-1/normal1x.webm` 保持正常播放速度，抽帧判读不等于逐帧或完整动态观感验收。

首轮四张表情截图来自行走后背面，已确认不适合脸部判读，因此另外执行 `capture-close.cjs`，同一固定bundle、房间renderer/灯光，只改变相机。`close-1/` 的6张图已逐张查看。正面中性脸眼口位置连贯、下颊与下巴轮廓连续；侧面可见鼻口和下巴，没有旧轴向尖锥候选那样的明显长尖下半脸。该相机下头发遮住部分眉眼和侧脸，遮挡区域不作通过结论。blink双眼闭合，happy闭眼笑并张口，aa张口与oh圆口都有可见区别，近景未见明显眼球外露或口腔漂离。仅验证这4个单表达，不包含全部表达、混合、讲话时序或眼球视线控制。

近景初次入口因证据目录到repo根的相对路径多一层而在加载Playwright前失败。首版脚本保存在 `capture-close-first-path-error.cjs`。修正路径后采集完成，模型、loader和控制器未修改。

## 尚未参与的链路和使用边界

本次为测试overlay，候选未进入foundation avatar factory、独立装备/coverage、appearance/live、palette、附件、碰撞/前臂/手接触配置或recipe保存恢复。房间walk任务完成属于原主实例的导航任务，候选实际参与自身骨架重定向和动作更新。未测跑步、坐起、舞蹈、多人隔离及动作全周期接触。不能把本次结果称为完整换装人物接入或M2完成。

原VRM元数据保持 `onlyAuthor / personalNonProfit / noRedistribution / modification prohibited / credit required`。本次按作者内部技术候选观察，商业游戏素材许可尚未审核，不改变元数据推定授权。2.16升级导出回执与原生源身份见 `input-provenance.json` 和精确请求。

GPU浏览器已全部关闭，录像窗口已释放。后续若接入需root明确完整factory与合法使用范围，当前观察不替代用户视觉选择。
