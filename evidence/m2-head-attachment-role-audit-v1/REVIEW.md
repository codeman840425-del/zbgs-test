# 附着件角色分类独立窄审

**通过分类合同审查，没有发现阻断已授权一次试验的分类错误；不等于形状、表情或生产准入通过。** 独立脚本30项检查全过，结果见 `result.json`。未调用Delaunay/SLIM或改原产物；检查时新包尚无generated数值结果。

从原VRM实际primitive索引和全部原表达端点直接重建，而非照抄新分类标签：

| 保留类别 | 精确unique节点 |
| --- | ---: |
| EyeIris | 386 |
| EyeHighlight | 510 |
| EyeWhite | 384 |
| 原颈接口 | 63 |
| 合计 | **1343** |

| 改为适配的类别 | 精确unique节点 |
| --- | ---: |
| FaceEyeline | 1718 |
| FaceEyelash | 1104 |
| EyeExtra | 50 |
| HairBack | 232 |
| 合计 | **3104** |

两集合精确覆盖原4447保护节点，无交集/遗漏；各面部件的base加54个原表达端点均有对应，HairBack无原morph时仅base。所有原endpoint-record的源索引、材料、端点及计数保留。坐标仅引用原域节点，未新增合并、近邻替代或删源。若未来同坐标多语义发生重叠，代码仍保固定类别优先；本源实际重叠为零。

原domain SHA `9f1966b3…`、embedding SHA `38b15fb4…`、native guide SHA `df4e6984…`与旧包一致；完整值在结果pins。两项native request逐字段一致，23guide及8外框不变。新b为1374节点，剩余4368自由节点；原soft_p=100000、identity1步/每请求20步、2µm/.12/真实截面2mm均未放宽。

独立用原tet的直接体积比复核全部四顶点受控的3791个tet：lean最低.617432，round最低.857875，均>.12。旧lean四个、round五个直接目标翻转见证现在都含已明确改为适配的节点，不再属于全固定目标tet。**解除的是旧固定点组合必然冲突，并没有证明其余自由tet或实际软求解能通过。**

pending仍明确保留共同G(P+D)、不改眼骨、发根/头侧/耳适配、眼白覆盖与闭眼/全部原表达、原三角strict、真实VRM属性和游戏验证。前一合同的blink/Joy/口型实际过程与发根读回继续有效；完整端点目录不能替代这些验收。preflight的`solverCalled/characterExported/runtimeAccepted`均为false，文义没有把分类过当形状过，新候选名称也与旧失败区分。

本结论只覆盖分类与受控目标前置；实际数值结果、附着关系、连续表情和4196准入仍待本包后续证据。
