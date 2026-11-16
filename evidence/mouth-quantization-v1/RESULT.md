# 男嘴 −12% 源精度缺口：隔离规范化候选

**新交付源通过原位置/法线门，当前运行数学无需修改；旧Blender-final失败保留。** 这是新导出规范版本的结果，不将原a3307文件重标通过，也没有发布新recipe或改公开a7efd。

根因是两条不同的Float32舍入路径：作者存absolute shapes后相减，runtime对原relative delta直接仿射。全部点采用同一明确规范、同一现有mouth域，未做v314补丁/改参数/放宽门。详细合同、完整editable→raw→canonical链和复跑命令见 `assets-source/mouth-quantization-v1/README.md`。

| 实际检查 | 结果与边界 |
|---|---|
| 原失败重现 | 现有真实模块+公开旧recipe，原final仍1.1056661605834961e−5 > 1e−5；Sorrow/FaceMouth/v314/Y |
| 新规范final vs同一runtime | 全54形态和Basis，POSITION最大0，NORMAL最大1.7763568394002505e−15；原3e−7m/1e−5门不变 |
| 原作者raw vs新final独立全形态 | 最大位置差3.026798367500305e−9m；保护点、284内部口腔点精确相同；32口缝0 |
| 独立法线/质量 | 未导入生成器或runtime的math.fsum检查最大5.151860771324124e−8；无新增退化/翻面；相对raw最大三角法向变化0.000363154° |
| 绑定/表达与非目标区 | 所核Body属性、UV、权重、骨/rest、表情映射、材质、纹理保持；完整55形态逐项检查，不只检查失败shape |
| 从原底重新制作 | Blender4.5.9/addon4.10.5、2线程，从原男性editable重建，两次raw同旧SHA；规范化后模型与recipe均与首候选逐字一致 |

候选路径 `assets-source/mouth-quantization-v1/candidate/avatar.vrm`，SHA `68a1050af661809282ad736add798f72187f69f40347abc3a3ac7dbe61a8de7a`。新recipe SHA `579f489bf1371f9171f6102d43815b4fd82004405ac3d103c77529cb2dc9d7fa`，id `male-mouth-canonical-v1`，仅−12%/原位。运行比对模块SHA `047e03373fb8792517fb92604232dc451748e89def701dd3bfbf6c978a903f73`。

证据：`runtime/report.json`/`fresh-runtime/report.json`保留旧失败与新通过；`source-audit/report.json`/`fresh-source-audit/report.json`保存全部形态、独立small-triangle witness和属性检查；`rebuild-comparison.json`及`author-rebuild.log`保存实际制作；执行脚本快照随报告保留。CLI后只新增raw/endpoint路径参数，初次执行脚本未覆盖。

**准入边界：** runtime门仍加载公开旧recipe，仅证明同一个现有算子与新源的数值一致，不冒充新recipe身份已准入。新final不是raw Blender直出，单独打开blend并导出必须再经过规范化步骤才是交付物。独立raw门保留作者形状约束，不能仅从“用了同公式”声称通过。当前观感、GPU、首绘成本没有被这项CPU源精度修复验收或改善。

兼容建议：保持所有旧recipe/id/SHA及保存记录原值，新增版本若接入需显式登记；不为此改facial-geometry.js。可先作为当前算子的新规范参考源记录使用，历史失败仍指向旧final。后续是否接入新id由root集成，不能静默改写旧端点来源。
