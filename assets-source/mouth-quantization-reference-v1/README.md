# 当前男性嘴宽算子的交付参考合同

本目录只登记现行 `male-mouth-visible-v2` 算子SHA `1b3e019f92c799bc2486b4608584e347aa5c8fe1bfda8170a2d3e54e16f0009c` 的两端点验证来源。**不改产品recipe、保存SHA、几何数学或UI，也不准入新male-mouth-canonical-v1 recipe。**

- −12%参考：`assets-source/mouth-quantization-v1/candidate/avatar.vrm`，SHA `68a1050af661809282ad736add798f72187f69f40347abc3a3ac7dbe61a8de7a`。这是作者editable→raw→固定量化规范→法线的生产导出修复，完整生产manifest及hash写入清单。
- +12%参考：原 `assets-source/mouth-visible-v2/generated/male-mouth-width-112-v2/avatar.vrm`，SHA `cb0a208eabef4ae0dc3d7605b10ae516a72023a8227481fb3d5b125614a9f7f2`。保留原Blender形状及法线finalizer流程，未规范化、未重新制作。
- 历史负端点 `a3307101…`仍单独复现原NORMAL失败。不改旧recipe.endpoints/旧报告，不将整包宣称全部是新规范导出。

`reference-manifest.json` SHA `76cedf6a3113dfcd0b7236f4268ea6bfc0821fce92a72e8bf5b8eeafea3ff1dd`。它的身份是验证合同版本；产品保存仍用原算子版本，不需要迁移。当前三个检查都实际确认`api.getState()`选中的原recipe id/SHA，避免夹具仅计算一套同公式结果。

```powershell
python scripts/mouth-quantization-v1/verify-retained.py
node scripts/mouth-quantization-reference-v1/check-runtime.mjs --out evidence/new-unique-mouth-reference-check
```

检查原位置门3e−7m与法线门1e−5，覆盖男全54形态与Basis、活跃primitive全buffer及非活跃实际引用点。两当前reference须通过、旧负历史项须在原shape/顶点/分量重现失败，否则退出失败。实际记录在 `evidence/mouth-quantization-reference-v1/runtime`；三项只有一项是预期历史失败，不称三项NORMAL全过。

可执行入口依赖现行安装公开recipe，与只读CPU模块相同；缺失需按现有installer恢复，不跳过hash。新检出保留canonical模型及原正端点，raw/rebuild重复二进制按各源包规则忽略。此参考清单无模型副本，不增加20MB重复资产。
