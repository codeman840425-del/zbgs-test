# 1K 制服源体的下颌配方

原制服男体的脸部皮肤有 98 个顶点随权重移动。候选权重为 0.625，最大位移 1.4412 mm，影响范围为局部下颌。全部中性三角形与源体比较，局部转角最大 5.8215°，未出现新的翻面。两次独立 Python 进程导出的候选 VRM 和各自回执逐字节相同。控制输入只把权重改为 0.375，最大位移降至 0.8647 mm。[网格逐项复核和产物摘要](verification.json)

| 输入 | 脸部 POSITION SHA256 前 12 位 | 模型 SHA256 前 12 位 |
| --- | --- | --- |
| 源体，权重 0 | 3a6793bbf6d6 | 2e66ee6c8852 |
| 候选，权重 0.625 | 4038bab45308 | 0beabf44f27c |
| 重建，权重 0.625 | 4038bab45308 | 0beabf44f27c |
| 对照，权重 0.375 | 89e8c287fc8f | c6ce7efc3da1 |

模板锁定旧版制服男体的 1K 派生、项目已制作的 Blender 下颌端点和发布来源记录。作者流程来自该端点的原始 Basis、全套相对形态和已有可编辑 Blender 源；本次直接读取归档的 Basis 坐标与位移。2056 个源点转换到 glTF 局部空间后，与待制身体逐序最大偏差为 3.73×10⁻⁹ m。权重在 0 至 1 之间做线性插值，0 会返回完整原件。该模板适用范围是这份已核拓扑和形态空间。[模板](../../../assets-source/rule-body-recipe-v1/template.json) · [既有 Blender 制作、适配和实际源](../../../assets-source/m2-male-face-v1/README.md) · [Khronos 形态目标定义](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#morph-targets)

使用条件沿 hecko 发布、归属 VRoid Project 的旧 β 0.14.0 男体。pixiv 的旧模型页给出 CC0，原 VRM 内声明 CC0；该模型是第三方导出，官方旧导出件之间的逐字节同一性仍缺证明。下颌端点是项目在这具原模型上的制作。发布者网页本轮在线读取受限，保留本地归档；pixiv 的许可页本轮在线可读。[源档及许可依据](../../../assets-source/foundation-male/LICENSE.md) · [发布者网页归档](../../../assets-source/foundation-male/publisher-page.html) · [pixiv 旧模型许可](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model)

法线随三角片邻域旋转更新，保留源模型自身的法线方向差异，同时处理 54 个面部相对形态的法线。54 个位置形态、14 组表情绑定、口眼各材质实际引用的中性坐标、两副 skin、全部蒙皮权重、逆绑定、54 个人形骨骼、视线骨、身体几何、材质及原贴图保持。回归独立读出几何，核对每一个未批准改动的 accessor、图片数据和文档层级。只有脸部皮肤的一个实际图元读取到变化的点。[候选回执](candidate-receipt.json) · [异参回执](control-receipt.json)

从盘根可重放下列命令。输入可指定另一份检出；输出和临时发布目录以制作工具的主检出为准。候选与重建目录已有同一产物时，命令重新计算后逐字节核对。回归覆盖另一独立 Git 输入、盘根绝对路径、父目录回退、Windows 联接、非法系数和摘要、失败重试及保留已有有效目录。

```powershell
python -B F:/gamemake/scripts/production/rule_body_producer.py --recipe assets-source/rule-body-recipe-v1/candidate.json --out output/m2-first-rule-delivery-v1/producer/candidate
python -B F:/gamemake/scripts/production/rule_body_producer.py --recipe assets-source/rule-body-recipe-v1/candidate.json --out output/m2-first-rule-delivery-v1/producer/replay
python -B F:/gamemake/scripts/production/rule_body_producer.py --recipe assets-source/rule-body-recipe-v1/control.json --out output/m2-first-rule-delivery-v1/producer/control
python -B F:/gamemake/scripts/production/test_rule_body_producer.py -v
```

以上回执覆盖生产与结构回读。轻量制服上衣、长裤和平底鞋须按候选身份重新核对适配。正式入库、游戏冷开、动态观感、普通机验证分别由相应接收证据判定。
