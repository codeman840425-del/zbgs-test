# Bo Chen 白衣、格裙和袖口的只读核对

两次隔离房间留存的原图均能看到格裙上的细密斑纹。五人近景能辨出格纹，袖口与手部交界有断续细线。两人房间也出现该现象，重现无需五人同时在场。Studio 原图能辨出毛衣针织纹和格裙，手臂伸展、手指外露。人物姿势、光照、背景、镜头和输出尺寸均不相同，现有三方资料无法定位产生差异的具体渲染步骤。[Studio 原图](../../../gamemake-test/native-studio-round/characters/studio-02-bo-chen/studio.png) · [两人远景](../../../gamemake-test/native-studio-round/crowd/evidence/two-02/01-roster.png) · [五人远景](../../../gamemake-test/native-studio-round/crowd/evidence/five-01/01-wide.png) · [五人场景中的 Bo 近景](../../../gamemake-test/native-studio-round/crowd/evidence/five-01/appearance-1.png)

**身份。** 实读作者目录及房间 `public/crowd-models` 的 VRM，均为 20,270,600 B，SHA-256 `5e7d736cdd4191ddaff9c747157dd05bb65796d8cab0c910c97e77b36bbe555c`。两次 `cases.json` 各自的实际加载结果均有该摘要、VRM 1、54 个 humanoid 骨、14 个 skinned mesh。加载器在 parse 前对 fetch 字节计算 SHA。Studio 截图来自重新打开并核对编辑参数的 `.vroid`，源文件为 8,477,136 B，SHA-256 `9d1ba1b6840c86302bb5913fbe38a95d056664cec7d19696e9b11a08e3604d14`。编辑器截图发生在 VRM 导出前。[作者记录](../../../gamemake-test/native-studio-round/characters/studio-02-bo-chen/provenance.json) · [制作流程](../../../gamemake-test/native-studio-round/produce.py) · [两人加载结果](../../../gamemake-test/native-studio-round/crowd/evidence/two-02/cases.json) · [五人加载结果](../../../gamemake-test/native-studio-round/crowd/evidence/five-01/cases.json)

**实际材质与 alpha。** 以下为 VRM 内 `Body (merged)` 的 UV0 底图。每行 MToon shade 与底色引用同一 texture，min/mag 均为 LINEAR、S/T 为 REPEAT。三者使用 MASK 0.5、worldCoordinates 描边宽度 0.0008，皮肤单面、两件衣物双面。五人场景的 `appearance-1` 读回三行各有底面与描边材质，均为 transparent=false、alphaTest=0.5、depthWrite=true。

| 部位 | primitive / 材质 / 图 | 图尺寸 | alpha 0 / 1–254 / 255 的像素数 | PNG SHA-256 |
|---|---|---|---:|---|
| 皮肤，含手 | 0 / 8 / 11 | 2048² | 988,155 / 32,532 / 3,173,617 | `3b87a0aa62777a8099f4bdfc11f736854e6c642e12ffccbcde07f5d71a491032` |
| 格裙 | 1 / 9 / 13 | 1024² | 276,077 / 2,996 / 769,503 | `84ed206aa80256452125628f801a8da38a4f9ea6e77c5d5d67d3be30a1dc9bee` |
| 白毛衣，含袖口 | 3 / 11 / 15 | 2048² | 2,728,277 / 12,601 / 1,453,426 | `1174c26855293411a76a104a35b7e9e84765a1a1f82e39250c4f47b90e683bec` |

这些计数覆盖完整图集。尚缺从异常屏幕像素到表面、UV、深度及描边 draw 的对应关系。此衣图含透明像素，无法使用仅适用于全不透明底图的半尺寸配方。

**运行差异与复现条件。** 两边的主场景初始化均为 antialias、DPR 上限 1.5、PCF 阴影、sRGB、ACESFilmic 曝光 1.08、半球灯 2.5、主光 2.9 和补光 1.1。隔离入口直接解析固定 VRM，保留内嵌衣物，网格 castShadow=true、receiveShadow=false。正式游戏经 foundationProfile、人物工厂、材质外观及装备层。当前主工程 `prototype/public` 下 31 份 VRM 均与 Bo 文件大小不同，正式 profile 内也没有该 ID 或 SHA，未知身体会被拒绝。[隔离加载](../../../gamemake-test/native-studio-round/crowd/prototype/src/crowd.js) · [正式房间](../../prototype/src/main.js) · [人物工厂](../../prototype/src/foundation-avatar.js) · [正式入口](../../prototype/src/foundation-profiles.js)

复现实验应先固定该 VRM SHA、同一动作时间与镜头。既有远景眼点为 (2.6, 5.95, 6.65)，五人近景眼点为 (2.31013146, 1.12, 4.41371799)，1152×720、Chromium headless ANGLE D3D11。需分别对照裙面纹样和腕袖边缘，并记录材质 draw、alpha、轮廓和该帧实际采样状态。正式入口尚无同源对照，保留 VIS-001 待归因。本次只读取既有图像、模型、代码和回执。[近景取镜与运行参数](../../../gamemake-test/native-studio-round/crowd/mixed.cjs) · [原问题记录](../../../gamemake-test/native-studio-round/issues/ISSUES.md)
