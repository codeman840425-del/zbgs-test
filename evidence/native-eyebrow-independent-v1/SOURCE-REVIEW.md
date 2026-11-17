# 原生眉色源独审

固定男7586的一种眉色源可承接，无源阶段阻断；运行事务与游戏未计通过。实际直接解包a18原VRM、7586当前完整皮肤男、2a6b原生导出；没有重做编辑器操作。

139个accessor的逐字节内容与元数据完全相同，节点/skin/IBM/UV/57morph/表达/spring及全部材质参数不变。21张图只有眉image8和缩略图image18变化。导出meta.name/version改为此次样件名；其它扩展及许可字段精确相同。首轮错误地要求全部extensions相等的失败已保 `first-full-extension-equality-failure.json`，不改成假通过。

7586的原FaceBrow PNG与a18精确相同：651a9bfb…；新图73b4aea1…为1024×256。全部14266个alpha>0像素RGB改变，整张alpha精确相同，247878个alpha=0像素RGBA精确相同。已直接看两张原图：眉毛形状与摆放相同，暖棕变深棕；PNG查看不是游戏光照观感验收。不存在“全部原RGB保持”的断言。

image8仅由material5的baseColor与MToon shadeMultiply消费，UV0、identity transform、LINEAR/REPEAT、BLEND保持。原/新导出HAIR对应的材质参数和PNG没有改变；原“发色+眉色”包保留发色未导出失败，不能将本眉色准入称为发色完成。眼白、高光、虹膜、脸与身体图像对原a18保持；7586仅已有Body完整皮肤图不同。

只读重建stage的3份资源与public逐字相等：manifest acd3ec4703cac152890dda313f9b535d3efc5da3770fb4be28a4338e418e223a，source651a9…，brown73b4…；不执行stage写入。源manifest62905d…与实际输入SHA/消费者/全量像素统计在 `source-result.json`。下一审核只针对共用眉＋虹膜事务、旧配方版本和私有资源，源文件不再修改。
