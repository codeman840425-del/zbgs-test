# 原生脸型/腰部参数导出样件

本包在同一女性原生 `.vroid` 上先导出 baseline，再各自从原源重新打开制作两个独立派生。Face 组把 `ChinRoundness` 从 `0.60` 改为 `0.78`、`ChinFullCheeked` 从 `0.30` 改为 `0.48`。Waist 组把 `WaistScaleMag` 从 `0.40` 改为 `0.58`。两个派生都保存、菜单重开读取参数、VRM1 无减面导出，最后恢复进入时男性文件并核 `ready=true, dirty=false`。

CPU 读回见 `cpu-readback/result.json`。Face 按实际 primitive indices 的变化是 Face_SKIN 737 个引用顶点、FaceMouth 976 个、HairBack 38 个，最大位移约 2.226mm、0.143mm 和 0.369mm。共享 accessor 的13组不代表13个部件都改变，Body_SKIN 的实际变化是 normal 数据。Face 的非 meta extensions 完全一致，表达绑定保持一致。Waist 的实际 Body_SKIN、Bottoms、Tops 引用顶点分别是1149、764、280个，最大约4.060mm。18个变化节点都是服装辅助骨，没有 humanoid 节点变化。3个 skin inverse-bind accessor 各有12个矩阵变化，非 meta extensions 的具体差异是 `VRMC_springBone.springs[2..7].joints[0..1].hitRadius`。表达绑定单独核对保持一致。

导出尺寸、完整节点/skin/accessor/材质/图片读回和原生请求记录均保留。`result-before-semantics-correction.json` 保留语义修订前的原报告副本。没有把 `78912` 或 `843ac` 直接重命名为新候选，两个 VRM 都有独立身份。原生 PNG、材质和授权 meta 不由本包改色。Baseline 与两个候选使用同一导出设置，baseline 仍是参数已存在于母源的工具对照，并非未改参数的人体源。

本包仅证明原生参数修改能产生真实导出几何差异。没有做游戏factory、装备fit、coverage、表情近景、动作或视觉审美验收，也没有声称衣物可复用。Face/waist 参数影响哪些衣物、原Body PNG和旧fit需后续按候选SHA独立核对。没有runtime/public/catalog/GPU或Git修改。

实际恢复入口和每次请求在 `records/`、`requests/`。`native_cycle` 未集中重放，因两个参数需要分别从同一源打开并保留不同冷开证据。已有首轮错误的 `vroid_set_param` 调用保留，正式修改使用明确的 `vroid_set_bone`，避免将失败请求冒充制作。
