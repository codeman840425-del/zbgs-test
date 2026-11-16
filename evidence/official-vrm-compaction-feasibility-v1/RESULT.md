# 官方 Face 顶点紧凑化：CPU 可行性

**官方工具对当前原男女 Face 的被引用数据成立，但不能直接接到现有编辑器前面。** Face-only样件保留所有三角、UV、法线、权重、骨绑定和非零形态贡献，显著减少理论morph纹理容量；当前`facial-geometry.prepare`按原完整数组/索引合同验证，会正确拒绝紧凑化geometry。本轮未改产品/作者源/公开SHA，未运行GPU，不承诺首次shader停顿改善。

调用本机 `three@0.187.0` / `@pixiv/three-vrm@3.5.5` 的 `VRMUtils.removeUnnecessaryVertices`，未调用combineMorphs/combineSkeletons/removeUnnecessaryJoints，未自写简化器。官方文档明确该工具仅处理indexed geometry的未引用顶点，目的是减少morph纹理体积：[VRMUtils官方说明](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMUtils.html)。本次实现事实以报告中的本机JS SHA为准，不用网页最新内容替代3.5.5版本身份。

原女性模型SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，原男性 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。实际执行后再次读文件SHA未变。脚本`check.mjs`可复跑到新目录；完整实际记录在`face-only/report.json`与执行快照。

## 已运行与等价边界

真实GLTFLoader + VRMLoaderPlugin解析两份原模型；仅纹理解码stub为空THREE.Texture，不是浏览器/GPU加载。官方工具运行前后：

- 每条原三角索引顺序/数量不变，经new→old映射逐项相等，未删除可见面或降低形态精度。
- 所有保留顶点的POSITION、NORMAL、UV、skinIndex/skinWeight及其他属性、全部保留morph逐分量用`Object.is`检查，值与符号零都相同；attribute类型/itemSize/normalized保持。索引自身重新编号，因此不宣称索引SHA不变。
- mesh对象、material对象、skeleton对象、bindMatrix/inverse、morph字典/influences、groups/drawRange均保持。bounds按官方实现复制原值，没有缩紧/另做剔除优化。
- 女16、男15项真实expression-manager操作（含happy .65 / blink .999 / aa .512组合）对应全部mesh influences相同。完整54/56形态数据逐项检查提供任意有限权重的线性等价依据，但没有实际GPU连续观感批准。
- Face-only调用采用模型真实共同Face父节点，先确认其后代mesh集合严格等于原9块Face。Body、服装、鞋、头发共6个非Face geometry对象与全部属性保持，未触覆盖/碰撞索引或骨架。

首次全VRM调用只作盘点（`run-complete`），确实同时改变了身体/服装/头发的顶点布局，**不建议将那种全身调用合入**。随后独立完成上述Face-only样件，无产品文件变动。

## 真实Face布局变化

| Face primitive内容 | 女紧凑顶点（每块原2055） | 男紧凑顶点（每块原2056） |
|---|---:|---:|
| Mouth |387|384|
| Skin |780|784|
| Brow |110|110|
| White |74|74|
| Eyeline |260|260|
| Eyelash |150|150|
| Iris |122|122|
| Highlight |122|122|
| EyeExtra |50|50|
| **9块合计** |**18,495 → 2,055**|**18,504 → 2,056**|

女9块均保留56个POSITION morph；男前8块均保54，**男50点`M00_000_00_EyeExtra_01_EYE`（Face primitive8）变成0个morph属性**。它不是EyeHighlight，后者仍为122点/54形态。

这是官方`reorganizeMorphAttributes`的真实行为：若所有保留点、所有morph属性都满足`value===0`，将`geometry.morphAttributes={}`。本男EyeExtra原54形态在被引用点全部为±0，其中2700分量为−0；没有任何非零贡献被删。形态列表的结构/字节不再相同，但当前所有表达的几何贡献仍为零；原mesh的字典和54项influences未被工具改写。后续不可盲目`updateMorphTargets()`而破坏这些绑定，亦不可把此例概括成所有primitive都保54/56结构。

初次审计把零清理条件误写为`assert.strictEqual(value,0)`，遇−0停止，失败原报告/脚本保留在`run/`。按官方明确的`===0`语义区分结构删除与数学零贡献后，在新`run-complete/`和`face-only/`实际完成。保留属性的逐分量Object.is门没有放宽；不是降低非零形态精度。

## dispose与当前合同拒绝

官方实现位于本机`three-vrm.module.js`的`removeUnnecessaryVertices`段：每个源geometry建立newGeometry并重排引用属性，最后对被替换的旧geometry调用dispose。Face-only样件的9个旧Face geometry各收到一次dispose；其他6个未dispose。旧array仍可供本CPU报告只读比较，不代表生产可把已发dispose的对象当未改变source/render缓存继续使用。

压缩后直接创建当前facialGeometry并调用`set({mouthWidth:-.12})`，男女均返回`applied:false / 五官源网格/表情格式不匹配`，记录在`currentEditorAttempt`。具体冲突：

1. `prepare`要求每primitive POSITION count等于原2055/2056、形态数量54/56，并核原POSITION/index/UV SHA；压缩后这些渲染数组本来就不同。
2. 当前多primitive共用完整全Face索引编号与morph缓冲，`fullIndices`据此计算邻域。压缩后每块局部0号代表不同原顶点，不能只改计数或替换SHA使检查通过，否则会算错权重/邻面。
3. 当前apply校验`mesh.geometry===record.geometry/owned`，restore回到原source geometry。source/render分层必须显式适配这三处，并管理canonical与compact两层dispose，而非加一次官方调用就结束。

## 理论纹理容量

按本机Three `WebGLMorphtargets`的RGBA32F/texture-array公式，由实际count/targets算得；下表每个值是**CPU backing和GPU基础纹理各自**所需的一份，不是实测VRAM。`MAX_TEXTURE_SIZE≥8192`无跨行填充：

| 9块Face纹理（bytes） | 女原→官方紧凑 | 男原→官方紧凑 |
|---|---:|---:|
| 当前POSITION-only |16,571,520 → 1,841,280|15,987,456 → 1,733,184|
| 假定所有保留morph的Face均POSITION+NORMAL |33,143,040 → 3,682,560|31,974,912 → 3,466,368|

第二行是布局容量推算，不是新预留NORMAL方案。男EyeExtra零morph没有texture-array。4096上限时原POSITION+NORMAL padding分别为66,060,288/63,700,992bytes，紧凑后仍为3,682,560/3,466,368；2048/4096/8192/16384全部公式结果在报告。真正渲染分配、驱动副本和Shader首用时间均未测。

Face-only官方调用一次CPU时间女约3.67ms、男2.19ms，排除解析/图片/GPU，只是此次运行，不是统计性能承诺。后续编辑仍可能逐次compact新clone，须实际评估分配和上传，不能把容量降低等同首用卡顿已解决。

## 可行的最小接入边界（本轮未实现）

可继续一个限定的**canonical source / compact render分层适配**，不需要重制作者资产或重写形变数学，但不是一行工具调用：

1. 在任何渲染重排前留住不可变canonical原POSITION/NORMAL/UV/index/全部morph。按原bodySHA、原recipeSHA和所有已有source门完整验证；不在compact数组上伪造原hash。
2. 全脸权重/邻域/normal算法仍在canonical编号下计算，得到完整正确输出后，再让官方工具作用于工作clone生成紧凑渲染geometry。不要直接dispose canonical源；初始化也用工作clone，使官方释放的是临时几何。
3. 显式记录每块new→old映射：原index引用值去重后升序。它等价于官方逐旧顶点升序扫描`isVertexUsed`。校验`newToOld[newIndex[k]]===oldIndex[k]`，逐属性/每shape投影精确。这只是验证映射，不另写简化器。
4. 将`record.sourceGeometry`和初始`baseRenderGeometry`、当前`ownedRenderGeometry`的身份/缓存/恢复/销毁分别管理。source仍可服务recipe验证；reset回compact base；actor dispose清两层。表达绑定继续引用原mesh，不重排targets/绑定；对官方删除的全零morph按原canonical源保留身份记录。
5. 仅原男女Face适配，Body/覆盖/碰撞/头发/材料/骨/派生全部保旧。先以完整原/新四域27例、投影、源拒绝、31表达和生命周期证明，随后才由root判断一次GPU对照。不扩大为combineMorphs或骨架整理。

上述路径可将改动限制在Face生成结果到渲染geometry的边界，已有全脸算法可保留；如果实施时必须重写source验证/全局索引合同或侵入Body，应停止。已将实际映射和限制直接交prototype；本审查没有与其并发修改产品文件。当前公开460保持。

复跑（输出目录必须新建）：

```powershell
node evidence/official-vrm-compaction-feasibility-v1/check.mjs F:/gamemake/evidence/new-official-face-compaction-check --face-only
```
