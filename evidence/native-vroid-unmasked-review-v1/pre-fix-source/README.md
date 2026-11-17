# 原生皮肤恢复的130-joint限定过渡基体

状态：**CPU派生与非目标保真核验通过；完整factory/衣物覆盖/动作视觉尚未准入**。仅用于原女性自身三件装备样件的后续接缝准备，不等于长期装备附骨机制或八体生产完成。

新资产身份：`native-vroid-unmasked-female-130-v1`。

- 文件：`generated/female-native-unmasked-130-v1.vrm`
- SHA256：`843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef`
- 长度：17,125,748 bytes

双来源与制作边界：

| 来源 | 固定身份 |
|---|---|
| 全几何、raw骨、skin、IBM、表情、morph、spring、材质结构和许可meta | 原 `assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm`，SHA `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3` |
| 唯一替换Body PNG | 原生仅卸Tops后导出的 `assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vrm`，SHA `188d6e2b423d5baeae11e5dffbed88b8508edaed08eda6d8177cf07ee330bcec` |
| 完整原编辑源 | female-native-round-waist-216.vroid，SHA `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de` |
| PNG来源编辑副本 | female-tops-removed.vroid，SHA `76955cfa0a2e711af2499e44cbf8682c2231445139a996cf2a549df2dd7d46ac` |

这是离线标准VRM资源派生，**不是一次新的VRoid原生导出，也没有声称存在已合并的可编辑.vroid**。原许可meta未扩大授权，仍是内部技术样件；原文件及原失败证据未改。

制作前实际核对image11只通过texture11被material8的`pbrMetallicRoughness.baseColorTexture`和`VRMC_materials_mtoon.shadeMultiplyTexture`消费，且material8仅用于mesh1/primitive0 Body；没有脸、头发或衣物消费者。source/donor均为2048²，整图RGB逐像素相等。拷贝的是donor嵌入PNG的完整原始字节（SHA `5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a`），未绘制肤色、填alpha或改变材质alphaMode。

写出后独立重新解析文件并核验：只新增一个bufferView、改Body image.bufferView及总buffer长度；撤销这三项后整个JSON与原源相等。原BIN完整前缀逐字节保留，所有旧bufferView字节保持，全部146个accessor独立解码全等，其余图片原始字节全等。原masked PNG仍作为不再引用的旧bufferView留在BIN中，以保持原数据前缀；这部分额外字节是明确的可复现性取舍，未作压缩优化。160个raw节点、三套skin各130joint、全部morph/IBM/humanoid/表达/spring/材质结构均保持。生成文件本身保原VRM内部meta，本包的新ID/SHA在资产记录中区分派生身份。

重建命令（在包含固定输入的独立检出、目标生成目录尚不存在时）：

```powershell
python assets-source/native-vroid-unmasked-base-v1/build.py
```

依赖本机现有Python、NumPy/Pillow和项目既有GLB读取器，无新安装。脚本拒绝覆盖输出，不自动删旧证据；恢复原版本只需选择原78912资源及其原manifest。本次没有修改菜单、profile、控制器、原生项目或GPU状态。

后续root接缝：

1. 本包**没有**生成新装备manifest。原三件独立装备仍明确绑定78912，不能仅改SHA冒称准入；需实际重核此新源对应骨/IBM/几何再生成新身份manifest，并保原提取/运行证据边界。
2. Body现为真实完整可见皮肤，原上衣遮罩不再永久烘入皮肤。穿衣须按该上衣实际遮盖规则制作新source身份的body coverage、验证开关与恢复；基础模式露肤通过不能推定穿衣不穿模。
3. 原上衣辅助骨仍在avatar并由原VRM spring运行。这里只支持原骨架已有的衣物范围，不支持任意新骨衣服。换装/基础模式、表情、动作、保存恢复及实际房间视觉仍需后验；本包不注册public或4196。

`preflight.json`保存图片消费者，`readback.json`保存全量核验与源身份；`package-files.json`固定交付文件。
