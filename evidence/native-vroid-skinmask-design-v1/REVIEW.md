# 原生SkinMask：建议预制原生RGBA状态切换，不新增shader alpha通道

2026-11-17，仅源码研究与CPU像素读回，未改runtime、未生成运行贴图或调用GPU/编辑器。建议root选一个小型、每实例的Body纹理状态owner，接入现有换装事务：穿指定top用原生masked PNG，卸top用843ac自带完整皮肤；两状态RGB一致，不改变肤色算法。所有状态须精确绑定avatarSHA/装备ID+SHA，不默认按top类型生效。

## 新证据：原上衣和改袖共用同一实际mask资源

`pixel-proof.json`固定读取78912原源、843ac完整皮肤、88a347原生改袖前基线、6a32481改袖56复用导出。后三个masked来源的Body PNG字节均为 `dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c`，不只是看起来相同。843ac完整皮肤PNG为 `5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a`；整图RGB一致。内存中取完整皮肤RGB和原生mask alpha，可逐字节重建原生masked RGBA，未输出合成图。

但改袖VRM本身Body只有8510三角、原源与843ac有10022；不能继承其Body完整性/indices。这里复用的是已确证同一PNG，改袖衣物自身geometry/bind/ID准入另走实际装备包。158个三角内的可见边界已证不能用当前二元face集合精确复现。

## 成熟实现与两种方案的差额

| 方案 | 当前成本和限制 |
|---|---|
| **预制原生RGBA状态切换（建议）** | 本例已经有原生masked/unmasked PNG，无需画图或CPU合成。只增加一个已SHA固定的masked纹理，保原map所有采样/colorSpace/UV属性，切换Body surface和Outline的map与shadeMultiplyTexture。原生边界随同一纹理/采样走；改袖同PNG可共享状态数据。现肤色是材质乘色，不需要“每肤色×每mask”图片组合。只支持本次明确状态；未知叠穿组合拒绝，不自动推导union。 |
| 运行时小型alpha组合 | 现`surface-layers.js`有像素合成/每实例Source/prepare/commit/dispose范式可复用，但它服务唇色RGB，不能直接接Body。CPU Canvas读取再写alpha新增解码/预乘/颜色转换和缓存工作；已有原生PNG时没有收益。shader独立alpha mask更大：当前MToon3.5.5没有alphaMap接口，其fragment的alphamap include被注释，需要同时改surface、outline、depth/distance路径和版本键，不是设置Three alphaMap就完成。暂不选。 |

已核安装版官方 `@pixiv/three-vrm-materials-mtoon 3.5.5`：map setter写uniform；fragment用map的RGBA并执行alphatest，outline也走该discard；shadeMultiplyTexture控制阴影色，不替代主alpha。材质`update(0)`可同步UV矩阵、opacity/alphaTest uniforms且不推进时间。Three r187 `WebGLShadowMap`默认depth/distance材质读取当前material.map与alphaTest。保相同UV、filter、MASK/.5和原RGB的map状态切换有现成可见/阴影路径；仍须实际GPU同状态验证，不能以源码代替影子通过。[官方MToon实现](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-materials-mtoon/src/MToonMaterial.ts)、[官方Three shadow实现](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLShadowMap.js)

## 最小接入点

1. **单一Body纹理所有者**：小模块可沿`createBodyCoverageSet`的`prepareEquipmentSet/isCurrent/commit/dispose/getInfo`接口，但不操作indices。descriptor只含精确avatarSHA、Body材质/源纹理身份、`states:[{equipment:[{id,sha256}],png:{url,sha256},width,height}]`。初始只一个有mask状态，原top和已准入改袖top映射同一PNG；无选中责任装备→原始完整皮肤。一个实例内其它Body纹理写者/冲突的覆盖owner应拒绝。不能给未知同时穿两件的组合猜一个合成规则。
2. **事务挂点**：`m1-equipment.js:133–148 prepareOutfit`先完成PNG获取、SHA、尺寸/采样/材质类型检查，再进入`:68–79 buildPreparedOutfit`。把纹理owner与现indices/garment coverage一样纳入整体`isCurrent`及dispose。所有失败都发生在可见状态改变之前；commit仅做已预校验的同步引用赋值，不await、不Canvas、不fetch，先整体validate再一起提交可见装备和纹理。不能先卸旧衣再等图，不能使用auto-retry。对本profile同一Body不要同时配置旧近似indices mask。
3. **默认与同步基础模式**：`createM1Equipment`初始await加载该唯一mask状态，再默认apply；这使当前同步`setDebugBody`可立即卸top恢复原map。以后新增状态可异步prepare。若同步分支尚未准备则明确抛错并保旧，不半切。
4. **肤色与表情隔离**：`character-appearance.js:95–110 applyColors`的skinTone只乘`color/shadeColorFactor`，不会写Body map，故不需重排整套外观管线；此owner不写这两个颜色因子。`facial-palette.js:115–131`只操作精确iris/lips，`surface-layers`也是该链上的RGB合成，不把Body塞进旧facial palette合同。以后若增加Body图案，必须显式统一其纹理所有权，不能两个异步回调互盖。
5. **两处现有基础模式耦合需显式处理**：`foundation-avatar.js:258–275`当前先要求appearance无发base准入，随后将Body换成灰色MeshStandardMaterial。新原生profile的“基础皮肤”必须保留原MToon材质，且不能因尚未做无发fit就禁止脱衣看皮肤。建议只给该profile显式“基础模式保原皮肤/保原发型”的数据策略，旧诊断灰体/旧无发规则保持；不是全局取消已有检查。否则即使mask成功，用户仍看不到真实恢复皮肤。

## 生命周期、暂停和失败约束

- 同一actor内所有Body surface/outline材料使用对应状态，材质对象保留，避免VRM表达/外观绑定失联。每actor独立Texture与Source；可以共享只读PNG字节/解码输入缓存，但不共享可变Texture或一个actor拥有的bitmap关闭权限。`Texture.clone()`后必须分离Source，保flipY=false、sRGB、LINEAR/REPEAT、无mipmap及源transform。优先沿GLTF/既有纹理加载的ImageBitmap解码约定，不能默认Canvas往返保证透明像素RGB。原完整皮肤texture是借用资源，不由owner dispose。
- 从未运行过动画的暂停状态也能首次穿/脱：commit立即更新所有目标材质map/shadeMap，`needsUpdate`并对MToon调用`update(0)`，不能等下一次vrm.update(dt>0)。`main.js:1573`暂停不simulate，但`:1601`仍render。当前PCF默认shadow每帧更新；若调用方将shadow autoUpdate关闭，commit后须请求一次shadow更新。不要偷偷推进动作来刷新贴图。
- 快切使用现有intentRevision/generation：慢请求返回时只可释放其暂存资源，不得覆盖新选择。两个实例A脱/B穿互不改map；销毁A不得dispose B/原avatar纹理。工厂现`foundation-avatar.js:358–367`先appearance.dispose后equipment.dispose再deepDispose：新owner在equipment.dispose中最后恢复借用原map，释放自己的texture并按拥有关系关闭bitmap，可与appearance初始化时捕获的masked map区别处理。失败构造路径也按同一顺序清理。
- 保留原灰体、原indices coverage和原源失败证据。不扩大native meta许可；纹理仍来自内部原生样件，运行时独立于编辑器不等于授予玩家导出或再分发权。

## 一次有界实现/验收建议（待root选择）

实现只含：固定PNG/descriptor、一个小owner、M1事务接线、该profile真实皮肤基础模式策略。无需新控制器/裁三角/通用合成器。先纯状态测试错误SHA/尺寸、慢请求过期、dispose和双实例拥有关系，再GPU在**暂停第一帧**检查基本→原top→改袖top→基本及warm/deep肤色交错、同机双实例、阴影和outline边界；注入一次加载失败须保旧衣/旧mask。核全部RGB不改、158边界沿原native纹理、无多余sourceClothes。实际材质/阴影、GPU纹理内存释放和game保存恢复目前全部未测。
