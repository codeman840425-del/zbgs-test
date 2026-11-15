# 当前男女点状边缘：源与运行路径核查

2026-11-14，只读核查；没有启动浏览器、修改产品或将图像症状判为根因。对象是 abdb 用户链所用当前男女 roundtrip，**不是旧 Seed 角色**。

源证据：`evidence/current-foundation-material-source-audit.json`。女 SHA256 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，男 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。安装版本 three-vrm 3.5.5 / Three 0.187.0。

## 已确认事实

- 两体各 2 个 glTF mesh（Body.baked、Face.baked）、15 个材质；每 mesh 仅一个 node 引用。逐 primitive 解析索引与 POSITION，以三个顶点位置排序作精确三角键：每 primitive 内、同 mesh 的不同 primitive 间完全相同位置三角均为 0。这排除这一级的完全重复面；没有检查近共面、跨 mesh、变形后穿插，不能扩大为没有任何几何问题。
- 男女 Body_SKIN 均 MASK/cutoff .5、FrontSide；Face_SKIN OPAQUE/FrontSide。两者启用 worldCoordinates 描边，VRM0 的 .075 经 v0compat ×.01 后为约 .00075m。身体描边 lightingMix=1，脸为 0。
- 两体 HairBack 均 BLEND、FrontSide、原 `_ZWrite=0`，**没有 outline**。眉/睫毛等透明面也大多没有 outline。头发点状边缘不能仅以“头发 outline 出错”解释。
- `foundation-avatar.js:52–76` 对所有 mesh 开 castShadow；没有开 receiveShadow。Three Mesh 默认 receiveShadow=false，因此自投影不能直接当作皮肤黑点既定来源，需实际 runtime dump 确认。
- three-vrm-materials-mtoon 安装源码 `_generateOutline`（约 798）：不是新增 outline mesh，而是原 mesh 的 `[surfaceMaterial, outlineMaterial]` 与同索引范围两个 geometry groups。outline 为克隆材质、BackSide、isOutline=true。顶点 shader 扩张法线并含 `gl_Position.z += 1E-6 * gl_Position.w`。正常情况下它不是简单未偏移重复绘制。
- **确定的诊断路径问题**：`foundation-avatar.js` 的 bodydebug 对数组每个元素创建普通 DoubleSide MeshStandardMaterial，但保留两个重复 groups。此时两次绘制相同面且都没有 outline 顶点扩张，额外绘制已成立。当前穿衣影片的原因仍不能由该诊断路径证明。
- Three `WebGLShadowMap.js:435–497,535–550` 会逐可见材质 group 走阴影 pass，默认深度材质不使用 MToon outline 顶点扩张；PCF 默认 shadowSide 为 surface side 的反面。当前两个 group 可贡献两侧阴影。这可能改变地面投影/成本，**尚未证明能导致身体上的点状边缘**。
- v0compat 依据 `_ALPHABLEND_ON` / `_ALPHATEST_ON` 转换 alphaMode，ZWrite+transparent 才设置 transparentWithZWrite。GLTFLoader 的透明深度逻辑随后适用；上述为源转换事实，实际 runtime alphaTest/depthWrite/side 应随 A/B 一并记录。

## 唯一优先的最小对照

固定 abdb、同一个男女姿态/相机/DPR/服装、暂停仿真但继续渲染。先记录可见 mesh/material、groups、side、transparent、alphaTest、depthWrite、isOutline、outlineWidthFactor、receive/castShadow 与纹理身份。保存原值。

仅将 `isOutline===true` 的 Body_SKIN / Face_SKIN 材质 `visible=false`，**不隐藏 mesh、不换材质、不改 geometry、不改相机、光照、DPR 或姿态**；渲染后捕获同一无压缩截图，再恢复原值捕获一次。男女分别比较皮肤轮廓与头发区域，记录未变化的区域；不能将无 outline 的 HairBack 一并当成该干预的直接对象。

`scripts/qa-material-diagnosis.cjs` 有旧版相似入口，但后续还改 side，且不钉本次身份/区域；不可直接把其历史结果套用。新实验应独立限定上面的单变量与恢复检查。

若描边关闭无改善，再独立设计下一单变量（例如头发透明路径或像素覆盖），不要同时关阴影、开双面、加深度偏移而丢失归因。先不改生产素材，也不以放大截图或视频压缩后的黑点数量作唯一判据。

## 当前结论

只读阶段已找到真实的描边/透明差异及 bodydebug 重复绘制。随后按批准窗口完成以下对照；没有修改产品。

## abdb 实际 A/B/还原

可重跑：`QA_M1_BUILD=abdb18defd26 node scripts/run-fixed-check.cjs experiments/m1-material-recipe-1/dist scripts/qa-foundation-outline-ab.cjs`（PowerShell 用 `$env:QA_M1_BUILD='abdb18defd26'` 设置环境）。归档 `evidence/foundation-outline-ab-abdb18defd26/`，含六张完整 PNG、report、visual-review、manifest；实际临时服务与 Chrome 均已关闭。

- 男女 live 与 fetched body identity/build 双端校验，实际仅各 2 个 SKIN outline 材质 changed；各 A/B/还原相机与 simulationTime 相同，pageerror=0。DPR=1，正面静止穿衣：女裙、男短裤。
- 查看全部六图：两体手臂、手、腿和下颌的深色点状细线在只关 Body/Face outline 后消失，恢复后重现。源 PNG 也有该症状，因此这部分不是仅视频编码产生。
- 原版与关闭版人物区域像素分别变化 2295/2242；这是差异定位，**不是品质分数**。女性还原全图像素完全相同；男性还原 6 个分散像素各单色道差 1/255，涵盖 UI/背景/衣服，不能写逐像素相同，但未见轮廓变化。
- runtime dump 确认 Body base alphaTest=.5、Face base alphaTest=0；二者 base FrontSide、outline BackSide、depthTest/write=true、receiveShadow=false。HairBack transparent=true、depthWrite=false、alphaTest=0、无 outline。
- 头发发丝/发际表现保留；本 A/B 未证明头发存在同一材质缺陷，更不能将头发透明网格等同 outline。

结论限定：**正常穿衣皮肤点状线已定位到 Body/Face 的 MToon outline 渲染贡献**，尚未区分亚像素线宽、深度偏移及其它 shader/raster 条件。关闭描边也移除了设计轮廓，不能直接当成已验收产品修复。没有测动态、其它角度、其它 DPR 或目标普通电脑。

bodydebug 重复绘制另作诊断修正，不混入这次正常材质归因。

## 后续唯一线宽对照：没有达到完整修复

按批准执行 `scripts/qa-foundation-outline-width.cjs`，同 abdb，Body/Face outline world 宽度仅由 .00075m 改 .0015m 再恢复；未改 side/alpha/depth、姿态、服装和其它材质。男女各正面/侧面 × 近景 3.2m / 房间距离 9m，共 8 组、24 张原 PNG。两个距离围绕相同人物目标，并非斜向“房间全景”相机预设。归档 `evidence/foundation-outline-width-abdb18defd26/`，另含逐组三联裁切、review、manifest 和首轮 QA 舍入断言失败记录。

逐组查看所得：近景下颌、臂、腿线变深、更连续，但仍有细小锯齿/断续；没有出现宽块状黑边，深色轮廓感确实更重。9m 的正面和侧面仍明显保留点线，不能认定加倍 world 宽度解决了不同观看距离下的问题。头发没有修改，也没有由此获得修复证据。

完整材质属性/身份和 simulationTime 校验通过，pageerror=0。相机最大数值舍入变化 2.22e-16m；首次直接 deepEqual 导致 QA 停止，随后只将 QA 改为记录并限制在 1e-12m 内，保留失败，未改产品。还原人物裁切全部为像素完全一致或最大 1/255 色道舍入。男近景正面还原全图有 1373 像素差异，位于底部 UI 区 (172,880)–(228,911)，不在人物区；不得将其写成全图像素相同。

建议：**不单独采用 .0015m world 宽度作为点状描边完整修复**。停止本轮参数试探；后续若继续应独立验证渲染策略，而非自动再加宽/偏移。当前只做静姿诊断，没有产品改动、动态闪烁验收或目标设备验收。

## 只读宽度纹理与屏幕模式核查

源直方图/嵌入图像 SHA：`evidence/foundation-outline-width-textures.json`。男女 **Body_SKIN 都没有 `_OutlineWidthTexture`**；因此身体手臂/腿的点线不能归因于这张纹理把宽度乘零。两体 Face_SKIN 有各自 256×256 图，线性过滤、REPEAT：女图 G=0 占 4.5471%、G=255 占 79.8553%，男图分别 2.4048%/67.5079%；其它为中间灰度。统计覆盖全图而非实际顶点 UV/GPU 采样，不能据此认定这些零区造成了下颌断点，也不应删除脸部局部遮罩。

核对 [官方 MToon 1.0 规范](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_materials_mtoon-1.0/README.md#outline)：screenCoordinates 的宽度随屏幕高度定义，目标是不随相机距离缩细；宽度纹理读取线性 G 通道，未指定时为 1。安装 3.5.5 的 vertex shader 实际按 G 乘 outlineOffset，再在屏幕模式乘 `vViewPosition.z / projectionMatrix[1].y`；v0compat 将源 `_OutlineWidthTexture` 接入该路径，原源图不会因改模式自动丢弃。

只提出一个后续因果对照，尚未执行：**仅 Body_SKIN outline 改为 screenCoordinates，取一个固定的约 1 个 drawing-buffer 像素目标**，不动 Face_SKIN、贴图、side/alpha/depth/法线/颜色，在现有同位两距离做 A/B/还原。按已安装 shader 的透视抵消和 NDC→像素关系，可用 `outlineWidthFactor=2/drawingBufferHeight` 作为单一测试值；法线投影仍影响实际局部宽度，不声称它保证处处 1px。其目的仅检验已排除宽度贴图的身体线条是否因 world 模式随距离变得低于像素覆盖；结果失败则停止，不自动扫描多个宽度/偏移。本轮主集成优先，没有再启动浏览器。

## 269 唯一 screenCoordinates 对照已执行：改善伴随副作用

上述提案随后获批准，在固定 `269a73423c97` 完成。归档入口：`evidence/foundation-outline-screen-269a73423c97/index.html`，包含两完整原片及静态三联；manifest 保存所有文件与脚本 SHA。没有修改产品，也没有扫描第二个宽度。

男女各 4 个现有相机预设 room/close/front/side，8 组 A/B/还原共 24 原 PNG；只改 Body_SKIN 的 outline mode/factor，**Face 原值保持**，其余采样材质属性逐项不变，全部 raw/normalized 骨 local pose 不变。实际 WebGL drawing buffer 为 1011×928，DPR1，factor=2/928≈.0021551724。全部身份/恢复检查通过，pageerror0；还原图像完全相同或最大1/255通道舍入。

全部三联已看：房间距离身体点线明显变得连续，近景四肢亦更连续，但深色线更重，手指尤明显；女性 room 发顶出现新增一小段/圈深边，与仅 Body outline 干预相关，具体头皮/头发遮挡几何未定位。**属于有副作用的渲染策略候选，不是边缘问题完成。** Face 未修，头发未改。

条件性动态复核已录原女裙两片：现有 room 相机，真实0.85m/s请求从[-2.6,1.8]到[2.6,1.8]，包含起转/行走/停止，无 simulate/相位修改，原/候选各约9.81秒，播放率1，相机逐帧差0。真实rAF初始位置相差约0.10mm，未伪称像素级同轨迹。两片全时段各3fps29帧、共58样本/6总览已全部检查，未见衣物/肢体消失，身体轮廓仍更深。

**3fps抽帧不能证明高频闪烁消失，也不能替代完整1×观看或用户画风接受。** 原片供直接观看；男性动态、其它动作/DPR/目标设备未由此通过。本轮到此停止，不默认合入，不继续扫参数。
