# 男性原生候选 CPU 前置

当前状态为 `male-source-readable-extraction-preflight-only`。已对真实男性文件重新解析、计算 rest skin、实际索引、骨权与贴图 alpha。未生成衣物 GLB、未运行男性 createEquipment、未进入 factory 或游戏验收。

## 固定来源

- VRM 为 `assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm`，13,395,084 bytes，SHA `a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da`。
- 可编辑源为同目录 `male-native-base-216.vroid`，4,514,004 bytes，SHA `c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a`。
- 版本来源沿已保存 `assets-source/vroid-bridge-study-v1/environment.json` 和 `evidence/vroid-bridge-study-v1/export-male-216.json`，VRoid 2.16.0 / Bridge 0.15.0，原生 VRM1，未删透明几何、无减面。此次未调用这些工具。
- 原 VRM meta 全文保存在 `generated/preflight.json`。作者为 `gamemake technical study`，导出 meta 当前 `onlyAuthor`、`personalNonProfit`、`allowRedistribution=false`、`modification=prohibited`。本前置只内部读取，未修改 meta、未推断商业或分发授权。

## 实测结构

男性为 91 节点、两套 skin 各 79 joints、54 humanoid 映射。女性原生源为 160 节点、130 joints，因此女性绑定表、节点常量和可兼容 SHA 不能沿用。Body mesh node 80 / mesh 1 / skin 1 的 rest world 为 identity，坐标按原米制读取。

|表面|primitive|实际引用点|三角面|正权重使用骨|
|---|---:|---:|---:|---:|
|Body|0|5870|10022|56|
|Bottoms|1|1076|1624|9|
|Shoes|2|600|712|6|
|Tops|3|739|1296|25|

四者共享原 9158 行属性，本组没有 morph targets。完整结果保留各属性/indices/IBM hash、使用骨、祖先节点、实际 rest bounds 和材质身份。权重非负/有限、索引合法，最大权重和误差 1.28523e-7，未重新归一化。

原 skin 含精确骨名 `J_Sec_R_TopsUpperLegBack_end 1_01`。GLTFLoader 会清理空格，既有 `equipment.js` 的 `userData.name` 别名机制可复用；后续须保原79条名字/IBM并核歧义，不能从女性补骨。当前没有对未来提取结果作 loader 验收。

## 身体存在与可见性

Body 10022 面真实存在，胸、腹、髋、膝下水平截面均读到原索引三角交线。截面存在不能证明闭合、完整解剖或全部皮肤可见。

Body 为 MASK，cutoff .5，2048×2048 PNG 的 SHA 为 `15ab2ecee54e10bfdb84a38be10e41fa7c7658e9a9f77b8293c2fd27569d7136`。10022 面的七点 nearest texel 采样中，1514 面全部低于 cutoff、1510 面全部为0；1672 面至少一点低于 cutoff。上胸带有11036个低于 cutoff 的样点，腹/髋/膝下所测样点无此项。采样不等于 GPU 双线性/mipmap 覆盖，也未把所有透明点都认定为某件衣物所遮。

女性原Body PNG SHA 为 `dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c`，男性图像字节不同，不能复制女性恢复图。已核 `skin-mask-recovery/generated` 只有女性卸 Tops 的 VRM/.vroid；男性仅 `male-before-skin-study.vroid`，SHA `2b01fecfdd0a1fafead21f9e9fe8aba3504e51964f72fe5b9a6c4223ac2493ed`，与本次 c936b 源也不同。没有男性已卸衣 PNG donor 可据以复用 unmasked 流程。

## 可复用和最小后续

1. `native-vroid-equipment-v1/build.py` 内的 accessor/bufferView/image/material 图原字节提取、原节点保留和 IBM/bindings 生成方法可复用。其 SOURCE/EXPECTED、node131、130关节隐含假设和78912资源ID须参数化。当前 `generated/extraction-input.json` 给定源 SHA、确切 node80/mesh1/skin1、三 primitive/material/原 accessor，作为后续提取输入描述。尚无消费者直接执行本描述，未假称已提取。
2. `native-vroid-body-audit-v1/audit.py` 的 `audit`、`skin-mask-recovery/readback.py` 的 `skeleton`/`primitive` 已原样复用在此次 CPU 读回。它们的命令行 main 含女性路径，需要替换输入参数后才能用于男性前后对照。
3. `native-vroid-equipment-v1/verify.mjs` 的原/提取同姿坐标比对、现有 MToon loader、`equipment.js` 原名别名和初始 `update(0)` 可以沿用实现。测试数据、骨数、exact manifest/source SHA 和三件实际属性必须重建，不能引用女性通过结果。
4. 完整可见基础模式仍需本次 c936b 男性源在原生工具中另存卸 Tops、保存冷开/导出，然后按实际 Body 几何/UV/语义骨权/IBM/PNG 来源核对应关系。女性 `native-vroid-unmasked-base-v1/build.py` 的原 PNG 追加、其他 JSON/BIN 保真验证可复用设计，但原 SOURCE/DONOR、图片/可编辑源 pin、女性输出身份不能原样运行。卸衣可能删辅助骨，须以男性读回决定能否沿用原完整骨架，而非预先承诺。

完成提取和男性 adapter CPU 验收后才具备下一步 room/factory 输入。覆盖/接触/色彩配方/保存恢复均未验证，当前不发布 public、不操作 Studio/GPU。

## 复现

```powershell
python -B assets-source/native-vroid-male-preflight-v1/preflight.py --out assets-source/native-vroid-male-preflight-v1/replay-fresh
```

只接受全新输出目录，写入前核 c936b/a18a SHA。现有 `generated` 不覆盖。使用当前 Python、NumPy 与 Pillow，报告记录 Python/NumPy 版本和已消费 helper SHA；本前置未锁定全新工具环境。源索引/alpha数组在 `generated/male-body-arrays.npz`，完整原审计在 `generated/male-result.json`；没有新男性衣物或身体产物。
