# 现有女长束发的分区配色小样

样件使用项目的 CC0 `female-ponytail-v1` 焊接根部版本 2。原女体 `027bed60…`、发型 GLB `1b785f9d…`、样式清单和 fit 保持原字节。原男女短发源可编辑并有 CC0 来源记录，两个原始 HAIR 都只有单片帽壳式表面。没有足以定位根尾的作者分区标记，因此样件范围仅为这条现有的长束发。[配方与输入摘要](../../assets-source/hair-region-pilot-v1/recipe.json) · [长束发作者资源](../../assets-source/m2-long-hair-v1/README.md) · [来源与许可](../../assets-source/hair-region-pilot-v1/provenance.json)

VRoid 作者文档给出了按发组或单束分配独立材质的做法，主纹理、高光和描边分别处理。项目已有的 `hairColor` 用整张中性化贴图和 MToon 乘色，在原体上还会给眉毛上色。原生男性发色的两次原生保存均未在 VRM 里的 HAIR 纹理或材质形成变化。既有原生调色模块可复用逐实例资源持有、摘要校验与恢复，参与本样件的颜色区域按发型几何另行固定。[VRoid 发组材质说明](https://vroid.pixiv.help/hc/en-us/articles/900005965706-How-to-edit-hair-color-and-texture-material) · [整发色实现](../../prototype/src/character-appearance.js) · [已封原生发色失败](../../assets-source/native-vroid-hair-color-base-v1/README.md) · [独立色版生命周期](../../prototype/src/native-palette-part.js)

源生成器先排帽壳，再排每环 16 个顶点。实际 `TEXCOORD_0` 的 V 沿作者轴向从 0.50 增至 0.66，同时环心从扎点向尾端下降。以位置和 UV 的原始 Float32 对逐一对应焊接前后的 609 个顶点。根区旁的近端着色从前三环之后渐入，尾区独立渐入。224 个帽壳顶点、410 个触帽壳或焊接三角以及前三环的权重均为零。眉、眼、眼线、睫毛、口部和两块皮肤的实际材质纹理单独读回，均无 HAIR 底图引用。整张原贴图、原始身体、草稿及玩法未改。[作者几何生成器](../../scripts/m2-long-hair-v1/build.py) · [保护区实测](readback.json)

后向外表的根区三角 548 和尾区三角 996 分别采原图像素 RGB 157 和 143，alpha 均为 255。两者中心根／尾权重约 0.975 和 0.898，线性绿色乘数分别约 0.542 和 1.251。帽壳三角也实际采样这两个 UV 位置。均值乘色是基于原图的 CPU 示意，实际游戏光照和观感待运行验收。项目内实际发布的小蒙版按冻结图元顶点顺序放置归一化 RG8，R 为根区、G 为尾区。消费方需同时验证身体、样式、fit、GLB、图元以及三个几何流摘要，并只在该发型实例的材料应用区域权重。[小蒙版及合同](../../assets-source/hair-region-pilot-v1/generated/manifest.json) · [glTF UV 坐标说明](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

同一配方输出两次，三个结果文件逐字节一致。Python 3.13.11、NumPy 2.4.2、Pillow 12.1.0 下，实际样件、错身体／错 fit／错发型、保护环或两段重叠、工程外输出等四项回归通过。[重复导出回执](repeat.json)

```powershell
python -B scripts/production/hair_region_source.py assets-source/hair-region-pilot-v1/recipe.json --output evidence/m2-hair-region-source-v1/repeat-fresh
python -B -m unittest discover -s scripts/production -p test_hair_region_source.py
```
