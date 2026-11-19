# 制服双人金发与眉毛灰度纹理共享审阅

固定基线为 `d96411eb / d9cadedb54f6` 的暖肤与原肤 bob 双人签名记录。源码审阅覆盖主工程 `3d855cece022` 及工作区接入的 `neutral-hair-textures.js`（审阅文件 SHA-256 为 `0dedd2004f3dc72c04227cff818fba64808547320dd83e0574fba69cad8b274e`），依赖为本机 Three.js 0.187.0（MIT）与 three-vrm 3.5.5。候选仅复用同一 WebGLRenderer 中的灰度像素源，每个角色仍持有自己的 Texture 和材质。[依赖版本](../../prototype/package.json) · [候选实现](../../prototype/src/neutral-hair-textures.js) · [双人基线](before/report.json)

## 像素、材质与采样

制服 VRM 在解析前验证完整 SHA-256，两人基模相同，均为 `1049f87a…c172c`。发图为索引 9、1024×1024、原 PNG 哈希 `1be9a663…11c47`，眉图为索引 16、1024×256、原 PNG 哈希 `d43b5654…1654f`。两个角色的实测发图主图及阴影图 RGBA 哈希均以 `c242b3495749` 开头，眉图对应哈希均以 `71c00265a613` 开头。候选沿用原算法，把每个像素的 RGB 三通道设为其中最大值，保留 alpha。发色和阴影强度写入角色私有 MToon 材质，制服的这两种肤色只调整脸与身体材质系数。bob 借用本角色的原发材质贴图。[来源核验](../../scripts/production/record_budget.py#L281) · [着色与 bob 接入](../../prototype/src/character-appearance.js) · [实际像素、采样与句柄](before/report.json)

共享像素身份由已验整 VRM 的 SHA-256、嵌入 PNG 的 bufferView、尺寸以及当前模块固定的灰度算法和解码路径决定。同一构建内这组字段定位同一输入与变换，主图／阴影图可以共用。候选初始化时从受控的原始发眉材质提取 parser 关联，记录原始 ImageBitmap；取图时按对象身份再核对。外部 URI、扩展纹理、HTML 图片、缺少关联、换过位图或另一 renderer 均不能借用该池中的原图身份。GLTFLoader 的直接 PNG 路径使用 ImageBitmapLoader 固定的颜色转换与 alpha 解码选项。后续若引入同一 body SHA 下可变的解码选项、按角色替换发眉 bufferView 的插件或多种灰度算法，须把这些输入加入身份，或回退到私有生成。现有法线替换限于已登记的独占法线图。[源身份与首用核对](../../prototype/src/neutral-hair-textures.js#L7) · [官方解码实现](../../prototype/node_modules/three/src/loaders/ImageBitmapLoader.js#L181) · [项目法线替换范围](../../prototype/src/uniform-normal-source.js)

r187 先按 Source 对象身份，再按 wrapS/T/R、magFilter、minFilter、anisotropy、internalFormat、format、type、generateMipmaps、mipmapsAutoUpdate、premultiplyAlpha、flipY、unpackAlignment、colorSpace 寻找 WebGLTexture。相同 Source 与上传组合共享分配，采样键不同则各自分配。每份 Texture 保留 UV channel、offset、repeat、rotation 与 matrix。Texture.copy 会标记自身需上传，候选在首次上传前换上目标 Source，并避免再标记在用的共享 Source。已有身体法线机制采用相同的每 renderer 池与私有包装边界。[官方缓存键](../../prototype/node_modules/three/src/renderers/webgl/WebGLTextures.js#L588) · [官方分配与计数](../../prototype/node_modules/three/src/renderers/webgl/WebGLTextures.js#L772) · [Texture.copy](../../prototype/node_modules/three/src/textures/Texture.js#L495) · [工程先例](../../prototype/src/shared-body-normal-source.js#L9)

## 预加载、切换与卸载

候选在初始化时一次性抽取 WeakMap，每项只保留原始 Texture 对应的像素身份和位图引用。角色的灰图缓存无需长期持有 parser；该对象的扩展原本可达完整 GLB BIN、解析依赖和纹理缓存。创建灰图时，像素变换和包装克隆完成后才登记租约。每角色对主图／阴影图同一源只加一次租。[身份映射](../../prototype/src/neutral-hair-textures.js#L34) · [GLTFParser 缓存](../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js#L2659) · [GLB 二进制引用](../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js#L3139)

外观 prepare 会提前生成所需灰图。同一存活角色取消或回滚时沿用原角色缓存，已准备的源可供下一次换色复用。制服样件上限为每角色四个私有灰图包装、两个像素源。发型异步返回前已有卸载与意图版本检查。卸载时取消事务、恢复原图、逐包装 dispose 并归还该角色租约。最后一份租约归还后删除池条目，可释放灰图 canvas 强引用；打开另一角色或先卸载其中一个不会关闭原始 ImageBitmap。r187 对已上传的包装按 usedTimes 计数，最后一个 GL 引用释放才删 WebGLTexture。[角色准备与卸载](../../prototype/src/character-appearance.js) · [候选释放](../../prototype/src/neutral-hair-textures.js#L78) · [官方释放](../../prototype/node_modules/three/src/renderers/webgl/WebGLTextures.js#L418)

虹膜、唇色、原生眉、装备覆盖及服装配方保留各角色的独立生命周期。脸部配色持有 context、像素数组、蒙版及原图副本并写入画布；装备准备和回滚受当前衣物选择控制；衣物销毁会枚举并 dispose 其材质纹理。候选不向这些路径出借 Texture、材质、骨架或可写像素。[面部着色](../../prototype/src/facial-palette.js#L90) · [换装事务](../../prototype/src/m1-equipment.js#L71) · [服装销毁](../../prototype/src/equipment.js#L251)

## 实测基线与待验节省量

旧版双人有八个独立 WebGL 分配。发图的主图句柄为 27、31，阴影图为 28、32；眉图的主图为 35、37，阴影图为 36、38。测得各槽均为 sRGB、线性、无 mip。若同一部位四份包装的完整采样键一致，八个分配预期合至两个。按 RGBA8 计算可少 `3 × (1024 × 1024 + 1024 × 256) × 4 = 15,728,640` 字节。旧版双人计数 81 对应候选预期 75，单人 41 对应预期 39。双人静态估算由 276,127,056 降至 260,398,416，距临时上限 268,435,456 尚有 8,037,040 字节。即使每个部位的主／阴影采样键需要独立分配，只跨两角色合并相同槽，预期仍可省四个分配、10,485,760 字节。原始 VRM 各自解码与其他纹理成本仍存在。[逐项分配记录](before/report.json) · [逐图预算](../m2-uniform-skin-v1/budget-signed-pair.json) · [双人上限](../m2-uniform-budget-groups-v1/report.json)

以上节省量是基于旧版句柄和 RGBA8 的推算。本次审阅未运行 GPU、未测物理显存或普通机帧耗时。验收可对两条签名记录冷开、单人与双人、逐人换色／还原、换装、先卸 A／先卸 B、全部卸载及重新进入逐段核对。重点是像素哈希一致、材质颜色独立、预加载取消后卸载、失败可重试、两名角色各有私有包装、存留者可继续采样且回到空场景基线 1。旧版保守预算与限额保留其原有含义。[之前预算复算](../m2-uniform-budget-groups-v1/report.json)
