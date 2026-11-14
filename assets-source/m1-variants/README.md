# M1A 局部几何风险样件

这不是原始 `.vroid` 的恢复，也不是可量产捏人系统。两个候选均独立读取已保存完整女性 Blender 工程，保留原件；不把前一个样件的修改叠到后一个上。源身份和工具版本见 `spec.json`、`source-inspection.json`、`../foundation/toolchain.json`。

## 两个限定几何修改

- `m1a-jaw-v1`：低于1.423m的前下脸平滑收窄，下颌横向最多8%；中央下巴最多向下4mm、向前2mm。用Basis计算每顶点位移，再给该顶点的全部57个shape key加同一位移。保留原口型/眨眼相对Basis的差值，不使用表情值冒充脸型修改；眼区按实际坐标保持不动。
- `m1a-waisthip-v1`：腰1.05m附近横向/前后各最多4%场、臀0.88m附近横向4%与前后3%场，在局部高度和横向范围平滑衰减；不是物体整体缩放。重叠区以实测最大位移和截面周长为准。骨架、头、手、鞋和脚的尺寸保持不动。完整Body与原服装应用相同空间变形，及膝裤从新的完整皮肤拓扑重新生成，保留6mm初始松量与真实折边。

参数单位是保留的Blender mesh局部米制坐标（Z向上、Y向前），原物体180°旋转矩阵不应用/不重写。顶点/三角、UV、权重和rest bind均不改。几何法线由正常导出过程更新。

## 可重建步骤

从仓库根目录执行（不要改写原件）：

```powershell
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1-variants/build-variants.py
python scripts/m1-variants/build-equipment.py m1a-jaw-v1
python scripts/m1-variants/build-equipment.py m1a-waisthip-v1
python scripts/m1-variants/audit.py
```

`build-variants.py` 保存每个新 `editable.blend` 后，重开并分别导出两次，要求VRM字节hash一致。原文件hash始终复核。装备构建脚本是当前M1确定性提取/裁片导出器的限定派生，以各新VRM为输入，输出新装备ID、完整inverseBindMatrix及**精确新body SHA256**。不得将兼容hash改回原体型或绕过loader。

产物根目录为 `prototype/public/assets/m1-variants/<id>/`，含 `avatar.vrm` 和 `equipment/equipment.json`。元数据/build report记录具体hash，不应把此README中的设计目标当成实际测试数字。最终source/装备blend与重建结果见生成报告。

## 离线检查边界

检查原件未改、骨架/rest matrix、拓扑/UV/权重/嵌入纹理不变；逐材质记录实际变化顶点/最大位移；对导出glTF全部POSITION morph delta核对；按真实完整皮肤三角与固定水平截面的交线总长度量围度变化。装备反查字节hash、兼容身份、原骨名称及inverse binds、权重归一。

这些是结构和数值检查。游戏里的表情/闭眼/口型、腰臀装备接缝、走坐起/鞋椅接触仍必须由主任务实际运行。没有因为改幅度小便继承原基模通过结论。

男性复用条件：可复用“保存Basis位移并同加所有相关key、固定身份导出、精确装备绑定检查”的流程；男性具有不同顶点和54个表情shape（女性56个，均不含Basis），材质/脸颌/骨骼尺寸也不同。不得复用女性顶点ID、厘米区间、衣物fit或验收结果；需要独立盘点和小样，再决定具体delta。

许可来源沿用原固定候选 `assets-source/foundation/source.json` 的记录：第三方VRoid beta Base_Female导出，页面/VRM metadata标示CC0及允许修改。来源链的“尚未字节匹配官方编辑器导出”限制保持，不因派生而变为已核验官方原工程。

## 本次实际导出与检查结果

Blender4.5.9、VRM addon4.10.5已实际运行。两件新主体各从自己的已保存blend重开并导出两次，SHA256逐字节一致：

| ID | 主体VRM SHA256 | 实际源编辑变化 |
|---|---|---|
| m1a-jaw-v1 | `3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011` | 原Face 613顶点；最大4.472mm；Body/眼/鞋未改 |
| m1a-waisthip-v1 | `10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5` | 原Body含衣片1782顶点；最大6.279mm；Face/鞋未改 |

导出后的有效材质顶点另列于 `audit-report.json`，不要把源blend计数与导出按材质拆分计数混同。jaw导出的脸皮肤最大位移4.472mm、口腔1.421mm；57个key的POSITION delta最大误差7.45e-9m。waisthip的皮肤最大5.856mm、上衣5.965mm、原裙6.279mm；脸的表情delta完全未变。所有原骨架/rest bind、拓扑、UV、权重、纹理和许可元数据保持；仅候选标题明确新身份。

真实完整皮肤三角水平截面交线总长度：腰高1.05m增加3.9867%，臀高0.88m增加3.6156%。不是整体尺度变化，也不是只把显示衣服拉宽。新裤从变更后的真实皮肤重新裁片生成；上衣/裙/鞋来自该候选的源衣片，分别带精确新hash。

8件GLB和2个装备manifest再次执行构建，10个文件hash全部相同，见 `equipment-rebuild-report.json`。两件新生成裤的独立可编辑blend已保存并重开检查，见 `pants-editable-report.json`；上衣/裙/鞋已在各完整 `editable.blend` 内。

生产 `prototype/src/equipment.js` 的真实身份拒绝路径也已在无浏览器Node下执行：原女性、男性、另一派生样件各作为错误身份，共6组、24件装备均在请求GLB前拒绝，未产生场景节点。见 `negative-identity-report.json`。这不替代成功加载/动作的游戏验证。

补充复现命令：

```powershell
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/m1-variants/save-pants-editable.py
python scripts/m1-variants/verify-rebuild.py
node scripts/m1-variants/qa-identity.mjs
```

可供集成读取的精确ID/URL/hash/装备映射：`prototype/public/assets/m1-variants/catalog.json`。其中运行时验收明确未验证；不会给seatLayerThickness伪造一个已通过的数值。当前仅离线资产冻结，主任务负责游戏接入、脸型三视图/表情、身材与装备同场景完整动作。
