# 原生几何复用独立核查

结论是：现有已保存原生样件没有一个“尚未进入 factory 的新脸/体几何变体”。可复用的是现有骨架、蒙皮、表情和材质合同；真正 FaceShape/Waist 改形仍缺导出的 VRM 证据。

实际字节读回比较：

- 女性 2.16 `female-native-round-waist-216.vrm`（`78912a…`）到 843ac 未遮罩基体（`843acca…`）：146 accessor 全部逐值相同，160 节点、3 skin、3 mesh 和扩展相同；仅 24 张图中的 Body PNG 改变。它是皮肤贴图派生，不是新几何。
- 男性 `a18a2d…` 到 7586 未遮罩基体（`7586d3…`）：139 accessor 全部相同，91 节点、2 skin、2 mesh 和扩展相同；仅 Body PNG 改变。同样不能作为体型变体。
- 已保存 Joy 眉毛表达候选 `48b08e…`→`b839ed…`：只改两个 morph POSITION accessor，消费者是 Face mesh 的 target 3 和 8；基础 POSITION、节点、skin、材质和 23 张图片不变。这是表情 morph 样件，不是脸体比例变体，也不能直接证明多表情/服装适配。

2.16 参数回执确实保存了女性 FaceShape `ChinRoundness=.6`、`ChinFullCheeked=.3` 和 Waist `.4`，但当前回执是菜单重开读回；没有相应的 candidate VRM 证明这些参数改变了导出几何。因此不把参数记录升级成 shape 资产。

进入现有 factory 的最小输入是一个新的冷开 `.vroid`、参数回执、baseline/candidate VRM，以及全量 POSITION/indices/UV/JOINTS/WEIGHTS/IBM、所有 morph、表达和 rest 读回。只要 POSITION 或拓扑改变，已有衣物 fit、bindings、coverage、body SHA 必须新建并重新核验；不能仅复用旧 clothing manifest。若只是 morph target 改变且 base geometry/skin/材质完全相同，可复用 130/79 骨和装备基础身份，但仍需表达与近景接触检查。

本次未调用编辑器、未导出新资产、未改运行时/公共文档、未用 GPU。脚本及完整统计在 `result.json` 与 `compare.py`；没有任何 face/body shape 通过结论。
