# 发布器身份与条件证据修复

1518ad14a9964cd83c51b5c14c7937aaa667eae4 的原脚本 SHA 为11604ff96e5bc41d5cf5fb9ae733e91ec719d05f1b8a964c1fafb8b26352ad77。原8个隔离case保留于report.json，其中5个本应拒绝的自洽输入被发布，涉及错误sourceBody、被拒款style重命名、空测量、零像素footprint和长发参考系漂移。原文件无关的单字节损坏可被SHA门正确拒绝。

修复使用独立固定的本地sourceSpec SHA，再核其原始VRM、GLB、manifest/sourceFit和所列helpers。每个目标同时连接body batch声明、runtime-index源manifest与profile SHA、实际生成VRM及public VRM。短发完整fit/manifest与对应canonical family比对。长发从已pin原sourceFit派生，只允许目标id/version1/targetSHA和同角色同形状的有限collider参数变化，保重力、关节、半径、参考系及attachment等其余原值。

条件证据要求neutral及morph-0..53的精确集合，record非空且无重复，每条新增pair测量数量与summary一致，深度有限非负、summary最大值一致，正/翻V两份footprint均有实际像素且alpha为0。报告sourceTexture必须匹配实际canonical GLB/VRM MainTex。完整几何或像素测量由已登记的源生产/审查承担，publisher核身份与数据合同。

全部验证在写输出前完成。发布只写缓存的已校验payload，在独立stage准备完整目录后交换，避免边验证边改live目录。合法数据沿原Windows文本序列化，确保catalog字节保持原样。

retest-v2-report.json共12/12通过，包括原8case、错误target/index自洽SHA、错误pose集合、summary计数错误和NaN深度。真实8短/4长重复发布与现有输出目录每个文件SHA一致。10个拒绝case的两套public输出树均零变化。实际当前catalog只有female-bob-v1、male-sidepart-v1与female-ponytail-headref-v3，失败卷发未进入。

```powershell
python -B evidence/m2-preset-hair-publisher-review-v1/retest-v2.py F:/gamemake
```

测试执行确切publisher于私有scratch ROOT，使用实际源JSON、报告和资源。大VRM使用只读用途hardlink，mutation仅改私有JSON。真实root public未作为输出路径，没有browser/GPU。证据不代表造型、动作或shader验收。当前sourceSpec pins对应v1源包，后续新版本需显式登记其实际源身份，不能用candidate自己声明的hash放行。
