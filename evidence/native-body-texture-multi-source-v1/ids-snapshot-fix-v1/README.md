# prepared IDs 数组别名修正

before.json在男女两源实际复现旧模块c29a14：prepare([top])后调用方改为['unknown','also-unknown']，commit的covered仍true，但activeIds被写入未验证字符串。旧模块快照before-module.js与失败记录保留，不修改父目录封包。

修复仅3处：入口数组/重复检查后创建selectedIds快照，装备规则校验使用快照，commit复制同一快照。资源准入表、材质、PNG、所有权和事务时序均未修改。

after.json：男女各自prepare后修改/清空、原空数组后来push均不改变已准备选择；冻结输入正常；初始未知ID仍拒绝；旧prepared仍被新prepared作废。并行男女纹理独立，销毁女性不改男性活跃ID/纹理，原source贴图不dispose。真实Three/MToon和实际源材质/entry，fetch/bitmap为原CPU替身；无GPU/原生调用。

最终模块SHA：b102d83ccc32c8e9c8ec9a269cb7c51120518287215066bfba50d2f0b52a1de1。准入数据SHA保持f97da8419cb8b98c027108291d3ff8f9362242c2273c8b183b1085dbbe9f7d37。

入口：`node evidence/native-body-texture-multi-source-v1/ids-snapshot-fix-v1/check.mjs`，输出拒覆盖。`--expect-bug`只用于旧模块，before证据已保存，不要把失败断言套在修复模块上。父包原回归仍保其原SHA语义；本次只复测受影响的选择快照、过期事务和实例隔离。
