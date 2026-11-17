# 原生几何复用独立核查

结论：78912确实是已设置FaceShape/Waist参数的原生导出，并已作为当前843ac的几何母源。此次未找到与当前基模不同、可直接复用的独立脸/体候选，也未找到能隔离这些参数影响的前后VRM对照。不能由843ac只换PNG推断78912没有接受参数或参数不影响几何。

实际字节读回比较：

- 女性 2.16 `female-native-round-waist-216.vrm`（`78912a…`）到 843ac 未遮罩基体（`843acca…`）：146 accessor 全部逐值相同，160 节点、3 skin、3 mesh 和扩展相同；仅 24 张图中的 Body PNG 改变。它是皮肤贴图派生，不是新几何。
- 男性 `a18a2d…` 到 7586 未遮罩基体（`7586d3…`）：139 accessor 全部相同，91 节点、2 skin、2 mesh 和扩展相同；仅 Body PNG 改变。同样不能作为体型变体。
- 已保存 Joy 眉毛表达候选 `48b08e…`→`b839ed…`：只改两个 morph POSITION accessor，消费者是 Face mesh 的 target 3 和 8；基础 POSITION、节点、skin、材质和 23 张图片不变。这是表情 morph 样件，不是脸体比例变体，也不能直接证明多表情/服装适配。

2.16 参数回执确实保存了女性 FaceShape `ChinRoundness=.6`、`ChinFullCheeked=.3` 和 Waist `.4`，并已导出78912；当前2.16回执是菜单重开读回。缺少的是相同导出设置的未改参数baseline VRM，故不能量化这三参数各自/合成对几何、骨与表达的影响；不否认原生导出存在。

下一最小制作包应复用已有合法原生.vroid，以同导出设置得到baseline及一个明确参数改动candidate，再比较全量POSITION/indices/UV/JOINTS/WEIGHTS/IBM、所有morph与表达/rest。当前核查不执行该包。新形体须建立自己的fit准入身份并重新测依赖；若实际绑定、衣物几何或coverage输入没有改变，可在精确核验后复用资源，不要求无因重新制作。若依赖改变，才重建对应几何/绑定/coverage，不能仅改compatibleSHA。表情候选的透明删除导出与当前完整源不同，不能直接替换avatar；其表情复用也需独立新源身份和近景检查。

本次未调用编辑器、未导出新资产、未改运行时/公共文档、未用 GPU。脚本及完整统计在 `result.json` 与 `compare.py`；没有任何 face/body shape 通过结论。

本次措辞纠正前的报告/result/package原字节保于 `before-wording-correction/`。数值读回未改，纠正的是从“母源等价”过度推断“没有原生改形导出”的结论。
