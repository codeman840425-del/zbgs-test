# 男女原生 Body 像素覆盖共用接缝

只改 `prototype/src/body-texture-coverage.js`，新增同目录 `body-texture-coverage-admissions.js` 准入数据。没有修改 main/factory/profile/staging、旧资产或生产者封包，未提交 Git、未用 Studio/GPU。

准入仍封闭：profile提供固定descriptor SHA，同时公共数据表只接受 **843ac女性 + 003e9808清单**、**7586男性 + c432a7cd清单** 两对。每对记录实际base/masked PNG SHA与证据路径。下载清单必须逐字节SHA一致，再核清单avatar、PNG、RGB保存合同；装备仍核真实传入catalog的avatarSHA、itemSHA、slot、必需规则、唯一ID/slot。清单包含不同数量规则（女4含optional sleeve，男3），规则数量和材质名由已准入清单整体SHA固定，不再写死女性控制器。未知清单即使自己算出正确SHA也不能准入。

材质sampler/UV0/identity transform/MASK .5/2048²、Body单primitive、MToon surface/outline、所有权、异步加载不发布、同步prepare/commit/dispose及update(0)原样保留。未改变覆盖或装备fit权限：只有已提供实际entry才可选；女性optional袖上衣不变成男性规则。新来源以后新增经实测的数据准入，不逐人物复制控制器。

实际检查：

- result.json从男女自己的固定VRM读取Body材质、sampler和base/shade引用，提取实际base PNG并核SHA；使用各自真实equipment.json。真实Three r187/MToon3.5.5对象update(0)，穿/脱和颜色因子不变。
- 错性别descriptor、替换清单内容、任意重算SHA的伪清单、女图给男或反向、错装备SHA/body/slot、未知ID、重复ID、错误sampler/alpha均拒绝。失败后原map不变，资源owner可重新获取。两件同slot拒绝由女性原回归同时覆盖。
- 男女并行各自拥有TextureSource/Texture/bitmap；女销毁不触碰男。延迟PNG fetch期间无发布，同材质第二owner拒绝；过期prepared不能覆盖最新基础皮肤状态。
- 原女性12组回归和现factory glue4组通过，结果均写本目录，不覆盖旧测试。glue继续拒绝texture与geometry coverage混用。

边界：CPU的fetch/ImageBitmap解码为替身；源PNG实际bytes/hash/IHDR及源材质JSON已读，不代表浏览器PNG上传、WebGL阴影或男服装适配/视觉通过。运行时基础map属于已由avatar loader按SHA验真的VRM；本模块沿用这一调用契约，不反向hash已解码GPU纹理来鉴别冒名的调用者。覆盖PNG则由模块自行逐字节验SHA。任意换身体/换衣/新遮罩未自动获得准入。

复现：`node evidence/native-body-texture-multi-source-v1/check.mjs`；`node evidence/native-body-texture-multi-source-v1/female-regression.mjs female-regression.json`；`node evidence/native-body-texture-multi-source-v1/glue-regression.mjs`。前两项拒覆盖结果，重跑须先保原文件。initial-result.json为添加两种伪清单拒绝前通过记录，模块SHA未变。

集成仍由root完成：使用男性manifest实际发布URL和SHA `c432a7cdd1f6f5e5af4bf07b79465b902f26c09b00f39254f206c2df24617143`；保证新准入数据模块一同入固定构建；不得给旧女profile替换男PNG。
