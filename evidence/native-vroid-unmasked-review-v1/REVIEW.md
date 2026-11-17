# Body PNG派生独审与有界provenance修复

当前843ac资源的二进制/引用保持已独立核验。发现的编辑源身份缺口已按root授权修复，实际重建与误源拒绝通过。没有GPU、编辑器、运行时或4196操作。

## 实际资源结论

双VRM输入实际SHA均符合封包，候选仍为 `843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef`。只增加一个原生PNG bufferView，并改image11的bufferView和总buffer长度。撤销这三类JSON差异后完整JSON等同原78912，原16191360字节BIN前缀、170旧bufferViews、146个独立解码accessor及全部非目标图片字节精确保持。

因此源nodes、skin/IBM、humanoid、morph、expressions、spring、材质/纹理/sampler及许可meta的数据保持结论成立。它是原保留几何的纹理派生，没有重新造骨、重算法线或改表情。没有用相同schema名称掩盖新来源。

Body image11仅经texture11被material8的baseColor和MToon shade引用，material8仅用于mesh1/primitive0。不是脸、头发或衣物的共享图片。复制的PNG完整字节与donor和单独交付PNG一致，SHA为 `5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a`。2048²解码RGB全等，608383个alpha texel改变，新alpha全部255。

这些事实只证明原Body保留面使用的PNG恢复不透明。没有从该事实推定所有人体表面完整、穿衣覆盖合理或游戏可见效果通过。原masked PNG作为未再消费的旧view留在BIN中属于明确额外空间成本，资源引用正确。

## 发现与修复

修前 `build.py` 对两个VRM有常量pin，却只在末尾对两个`.vroid`计算当前hash写入editableSources，没有对README所列311a/76955核验。当前实际`.vroid`身份正确，但将来同路径误源会被重标成来源。修前脚本SHA `27d0c16144ef5001270813dee34699e5d3d5dec52fecce73dd7dc3685caf3bc0`，原readback SHA `e0f3d0ea281ad656ec7330aa3d0cbbf8c53753a6009cda22c17adc67081a500e`，原六项清单及README副本均在pre-fix-source保留。

修后在建立输出前固定核验两个编辑源，产物生成后再核未变。新增独立`--out`和`--check`，实际重新构建并核VRM/PNG字节，对旧receipt是否已更新单独报告，不覆盖已有失败。

fixed-rebuild-v1实际生成相同843ac及PNG，记录两editableSource的expected/actual/verified身份。仅在资源字节核同后，将此次真实生成的receipt复制回源包，没有只手改scriptSha。fixed-recheck-v2再次实际重建，两个资源同字节且readbackReceiptCurrent为true。

误源测试仅在本review目录将独立`.vroid`副本改一位，通过显式`--editable-source`入口运行。它在输出创建前拒绝，原源未改，raw stderr保留。重复默认构建也因已有generated拒绝，所有已有文件hash不变。

## 可重建的确切范围

当前能从两个封定VRM及同身份编辑源溯源门确定性重建843ac。两个`.vroid`是已保存来源，不是本次实际几何/PNG运算输入。本次没有重新运行其原生导出，也没有可编辑合并`.vroid`，不能声称仅靠任意当前编辑器从这些文件就逐字节重新导出843ac。现有README对离线派生和无合并编辑源的区分准确。

## 新SHA装备接缝须补证

- 新注册manifest须单独绑定843ac及实际装备SHA，并引用本次非目标保持证据。原78912记录维持原身份。加载后还应核实际raw骨、skin/IBM与装备几何消费者，没有自动放开任意派生SHA。
- 新Body PNG不再提供旧的上衣alpha遮蔽。基础/穿衣模式、source-CLOTH隐藏、每件上衣的实际coverage及卸装/配方恢复须针对新源验证，不能复用“原来被皮肤遮罩藏住”的外观结果当穿衣通过。
- UV、RGB与非目标源数据保持可支持明确的palette/fit复用分析，但新图片SHA和alpha约定须进入对应新资源记录。原image pin不能直接冒充新Body PNG。
- 原衣物辅助骨和spring数据仍由原avatar持有。只能证明现有衣物范围的限定复用，未新增任意附骨服装能力。真实表情manager、动作、衣物接触、材质及保存恢复仍待root固定房间验证。

本报告独立二进制读回与producer修复分开记录，后者不再称独立作者实现。最终source及receipt身份见review-result.json。
