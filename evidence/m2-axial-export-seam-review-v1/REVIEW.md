# PCHIP轴向方法的原网格导出接缝

2026-11-16，读取主树 `c7ffecd243a9f68bb54de02944ef6887a95f72c6`。请求配置沿用 gpt-6.1-sol/high，实际provider与Hook拦截未独立核验。本次仅源码和原62b源数组读回，没有打开正在实现的轴向函数包，没有执行G、形状求解、导出、55帧strict或GPU。

**现有GLB容器bake、法线传递和原strict函数可复用。仍需一个有界的完整accessor装配接缝，以及显式的新方法后验版本。** 当前没有数值候选，也没有新的导出或外观通过。

## 实际端点记录与完整accessor

原 `endpoint-records.json` 有498条记录、113713个点发生项。必须按每条的 `positionAccessor / endpoint / sourceIndices / offset / count` 回填，不能直接reshape成55帧。

| 原POSITION accessor | 完整顶点数 | 记录覆盖 | 原NORMAL accessor | morph结构 |
| --- | ---: | --- | ---: | --- |
| 7 | 7855 | base仅633点，另7222点没有发生项 | 8 | 0个目标 |
| 21 | 2056 | base及54个目标均覆盖全部2056点 | 22 | 54个目标均仅有POSITION |

同POSITION组的全部primitive使用相同NORMAL accessor及相同目标列表。当前源没有TANGENT。记录中的选点均保原primitive索引，Face/Mouth编号和baseline仍可原样使用。

后续求值应遍历所有实际引用POSITION accessor及全部原morph，包括同accessor的衣领、鞋、头发和隐藏原部件，完整建立 `positions`、`normals`、全部 `endpoints` 和 `endpointNormals`。原发生项按sourceIndices回填并检查重复一致性，不能继承旧domain筛选作为完整导出域。对7222个未记录点，只有新G的支撑域已证明该处及邻域为identity时才可保留原P/N，并提供全ID覆盖证据；否则须对这些真实源点求G和实际DG。**记录缺失本身不能证明identity。** 同坐标的不同UV/法线顶点保各自索引和属性，同一G的坐标输出应一致。共享POSITION的primitive若有不同targets列表必须明确拒绝，不擅自合并。未引用缓冲项单列并保源，不当作实际网格。

这只是完整原网格装配要求。已有身体和衣物适配职责仍保留，不从头部点记录推定原衣物已适配，也不把原62b合同扩大为其他身体SHA。

机器清单保存在同目录 `source-index-inventory.json`，SHA为 `51f938f9c604e01020db9d95a7b987bd336741c5172ffa610059345cb35532b9`。它覆盖全部2个唯一POSITION组和9911个实际引用源ID、每primitive/material、原index/attribute及每个target的POSITION/NORMAL/TANGENT引用和存在性、原组件类型packed值SHA。当前共享targets冲突0、未引用POSITION缓冲项0，仍保留显式冲突及未引用字段。

原Body是node67/mesh0/skin0，Face是node68/mesh1/skin1。两者都直接在scene0根节点列表中，没有matrix/TRS或上级mesh变换，source-rest mesh变换均为identity。全部primitive因此在同一原glTF rest米制消费P和P+D，沿原Head.fit的 `H=[0.0005088170291855931,1.5453999042510986,-0.006267889402806759]` 求G。运行时实例位置、VRM朝向修正、骨骼姿态和世界矩阵不参与该源空间求值。清单逐primitive记录其消费node及原变换字段。

## 可复用的实际函数

| 文件与函数 | 可直接复用的职责 | 调用边界 |
| --- | --- | --- |
| `scripts/production/flow.py` 的 `GLB` | 读原GLB文档、binary及accessor | 源62b SHA先核，不改索引编号 |
| `scripts/m2-representative-cage-trial-v1/preflight.py` 的 `group_records`，第88行 | 按POSITION组收集原P、全部primitive三角及目标列表 | 已有检查要求共享NORMAL和目标一致，适合当前原源 |
| `scripts/m2-representative-batch-v1/deform.py` 的 `normal_map`，第106行 | 用输入实际J的逆转置传递原法线，保原法线长度 | 传入新G在对应源点的DG，不能沿用旧tet/cage J或用位移近似法线 |
| `scripts/m2-representative-head-cage-v1/export.py` 的 `bake`，第20行 | deep-copy文档、保原binary前缀、追加Float32 POSITION/NORMAL及morph差值，保skin/IBM/UV/images/表达绑定 | 调用者必须先补完整数组和严格数量检查，另处理准确的新方法generator身份 |
| 同文件的 `normals`，第9行 | 从传入几何和三角累计面积法线 | 用于几何诊断。源着色N与其有明显角差，着色用途须保原规则及identity方向，不能默认直接替换 |
| `scripts/m2-head-volume-slim-v1/common.py` 的 `float32_readback`，第159行 | 原发生项到拟Float32 base/morph回读 | 无solver依赖，可在新接缝复用。它不生成完整accessor或法线 |
| 同文件的 `horizontal_sections`，第184行 | AST复用原 `surface_widths`，重新切原101截面 | 使用新完整Float32 base，保原requestedY/半宽和2mm门。正式门测原mesh base，Neutral target0仍另列原表达 |
| `scripts/m2-representative-head-cage-v1/head.py` 的 `contacts`，第30行，以及冻结 `segment_hits` | 保原FaceMouth/Face_SKIN三角编号的strict求交 | 对最终拟bake或实际VRM Float32端点执行，逐55帧比原baseline，新增对仍失败 |
| `scripts/m2-head-attachment-readback-v1/readback.py` 的 `reconstruct_face`、`fixed_endpoint_readback`、`actual_vrm_readback` | 源索引恢复、固定类别位移及实际VRM源合同/端点检查 | 几何工具部分可复用，方法装载和数值gate须显式新版本 |

原基础 `scripts/m1b-assets/export-body.py` 用固定Blender/addon重开已保存blend，验证54形状、packed图片和旧roundtrip SHA。它没有接收新mapped端点的接口，本轮不需要重新走该导出路径。`scripts/production/`中没有独立通用export.py。已有cage-trial/head-cage两份bake核心基本相同，选择现有head-cage核心即可，避免再造容器写入器。

`representative-batch-v1/v2` 的 `rewrite` 已实现POSITION和NORMAL的完整morph处理，可作接缝参考；其整体调用还绑定旧field、旧保护规则、旧donor和旧generator。直接整段调用会带入旧方法语义。

## 法线和Float32烘焙的最小数据合同

几何法线按实际输出三角叉积重新求值，用于退化、局部朝向和翻面诊断，须结合实际J与局部转动解释。着色法线保留源N的职责，源N可能包含作者自定义或不同平滑/加权规则。

本次只在原源identity几何上调用既有面积累计 `export.normals`，与源N的角差如下。没有执行新G或导出。

| POSITION组 | 角差中位数 | p95 | 最大角差 |
| --- | ---: | ---: | ---: |
| 7 | 2.669919° | 22.391146° | 84.142379° |
| 21 | 0.707843° | 24.704093° | 113.097007° |

这些差异没有证明源N一定经过手工编辑，但面积平均与原着色方向的identity等价性未成立。直接替换会改变原有着色。一个可选的最小接法是复用 `legacy.normal_map`，按实际G的J逆转置传递原N，并用实际光照和identity方向回读验证。它不自动证明所有属性或画风通过。

对每个原点P及原表达位置增量D，保存同一个实际G的结果和导数。原base着色法线为N，原morph NORMAL增量不存在时取零。

```text
Q  = G(P)                 J0 = DG(P)
E  = G(P + D)             Je = DG(P + D)
N0 = normal_map(N, J0)
Ne = normal_map(N + originalNormalDelta, Je)
```

交给现有bake的数组为完整Q/N0以及按原target顺序排列的E/Ne。它写出Float32(Q)、Float32(N0)、Float32(E−Q)及Float32(Ne−N0)。**当前54个原目标全部缺NORMAL，源表达沿用base N；新G下须显式计算各endpoint着色N差值。** 实际DG必须在各自P+D处求值，不能把base J复用给全部表情。位置恰好未动的一个点，也不足以把DG直接填成I。G为identity时，N0和Ne均应保原N方向，54个表达NORMAL增量应为0。保留零增量也保持完整目标列表。

源NORMAL长度由现有 `normal_map` 保留。该函数对接近I的J使用既有1e−6判定，不另改阈值。对新实际G应检查有限性、适用点集及原det>.12门，再调用法线线性求解。输出需核base法线和54个morph法线的维度、有限性及实际Float32差值回读。当前后验 `actual_vrm_readback` 只对base NORMAL查形状/有限性，并没有核全部morph NORMAL与预期Ne，因此这项是明确的后续补口。

最终顶点端点为 `Float32(Q) + Float32(E−Q)`，不是直接 `Float32(E)`。法线也按base加Float32 delta恢复。应先核拟烘焙回读，再由实际VRM重新解码相同数组，不能只比导出前Float64。图片通过原binary前缀和原image引用保留，仍应核图片payload SHA。原JOINTS/WEIGHTS、IBM、UV、材质、原triangle order、目标数量及VRM表达绑定均保持源身份。

glTF官方2.0.1规格的Morph Targets节规定NORMAL目标存位移，目标accessor计数与base一致，位移在skin/node变换前应用。原base有NORMAL而全部目标缺NORMAL时，该源没有表达法线增量。本机Three0.187.0的GLTFLoader `addMorphTargets` 读取NORMAL目标并设置 `morphTargetsRelative=true`，`morphnormal_vertex` 按权重把增量加到base。MToon3.5.5也包含该morph-normal chunk，再执行skinning并归一化着色法线。这支持上述差值编码，仍需实际材质/光照检查，shader归一化不会替离线G生成正确法线。官方页记录version2.0.1、2021-10-11及源commit `8e798b02d254cea97659a333cfcb20875b62bdd4`。[Khronos glTF Morph Targets](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes-morph-targets)

## 现有bake的三项调用约定

1. `zip(originalTargets, endpoints, endpointNormals)`没有strict长度检查。调用前必须验证当前accessor7三者为0、accessor21三者为54，数组均完整且共享primitive目标一致。少给数组会静默截短，这不是可接受的恢复行为。
2. `bake`会在传入results中写入 `positionAccessor / normalAccessor / targets` 缓存。每次导出必须传新建完整results或deep-copy，不能拿上次已变异的results对新source doc重复bake。
3. 现函数把asset.generator硬编码为旧head-cage/MeshDeform。新G候选必须以显式新方法ID、方法spec SHA和函数/参数身份写入真实provenance。可保留现有二进制追加核心，并在后续授权中做最小的generator参数接缝或原调用层等效处理。不能把新函数输出标为旧cage导出，也不需重写导出器。

以上是静态确认的输入/调用边界。本次没有调用bake生成资源，也没有把有效旧调用重标成失败。

## 新方法后验需要显式版本

旧 `attachment-readback-v1` 的 `load_inputs` 明确要求 `semantic-head-attachment-slim-source-v1` 和 `male-head-attachment-slim-v1`。`check_numeric_report`要求旧SLIM结果schema、成功status、id、methodSpecSha256、sourceEndpointRecords及 `actual.minimumDeterminant` 等字段。`execute`还固定了 `-attachment-slim-v1` 候选ID。spec中旧semanticContract SHA为 `59b34c062163b39e1d1b92bfb35ae12c3f7efcc7fa01b71e62efc96124f83f16`。

新G必须新增明确的轴向方法spec/结果schema/候选ID及对应的窄后验版本或adapter，保旧包不变。新版本核自己的精确method SHA、函数/参数资源和原endpoint-record SHA，再复用上述坐标恢复、Float32、strict和实际VRM工具。无需新检测平台。不能改report去冒充旧method SHA，也不能借旧SLIM成功status。

新数值门报告应明确为**实际G在原源/表达点及所声明检查范围的Jdet**，与旧tet体积/J指标区分。不能将G的行列式塞进旧tet字段后声称通过原SLIM结果。仍须原实际G det>.12、原固定eye/neck和本方法边界身份≤2µm、101真实Float32截面无缺且误差≤2mm、完整55帧原strict基线及新增对拒绝。新函数若能提供连续范围证明，应另给准确范围，不能从点样本外推。

source-male.json的原三角、原strict baseline及Neutral/Blink/Joy绑定可原样引用。源合同旧的全部feature冻结声明不能覆盖新附着分类，必须在新方法合同明确继承保留固定EyeIris/Highlight/White、颈接口及已声明边界，EyeLine/Eyelash/EyeExtra/HairBack的共同适配职责另验。发根、眼白遮盖、真实闭眼/Joy、混合表达、动作与游戏保存恢复仍保后续验收范围。

**停止边界保持不变。** 未通过新数值初门的候选不运行55帧后验、不导出。当前只完成源码接缝审查，没有数值、导出或游戏准入。

## 本次读取身份

原男性VRM SHA为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。以下为实际文件字节SHA256，未改写这些文件。

| 文件 | SHA256 |
| --- | --- |
| scripts/production/flow.py | d9b7d1b2ceb24622a92abe1af8737da08d93f00a3e51113f5155487af789b1ba |
| scripts/m2-representative-cage-trial-v1/preflight.py | dc42c98abb7255792f0b814d42e38833bae87a3e30d0ce513dc138e28f9ac13c |
| scripts/m2-representative-cage-trial-v1/export.py | 1eae97500d3bcf334cdcc5464bbfff079aadfe1fff58348ac8843e2f4c488830 |
| scripts/m2-representative-head-cage-v1/export.py | 06a673b7690f38cad0c6d00b46e8345b44f48d94712cc33ab8b7990e2afc1101 |
| scripts/m2-representative-head-cage-v1/batch.py | 9e2e3ae0608608efb4938778f00962937c831eb2a93da9b908b31577ebc85bd6 |
| scripts/m2-representative-head-cage-v1/head.py | 3d19e820102562813714e2a9e4d19a18842effb12e8a0715d3cc36de92d2774a |
| scripts/m2-hairstyle-v1/check-head-space.py | 3b51291499b17bfe756a4e1760522bd6117362bdb8b34ac989e1b5609695b2a8 |
| scripts/m2-representative-batch-v1/deform.py | 58bbf5295d6532defd52bef270efe7a49ee78854b1737734a4eb8bb5b4b4c260 |
| scripts/m2-representative-batch-v2/deform.py | 9eaede97e6d4c6cb5d95259f4a009a80ecd1980f387f7ddd325dc5486cc2e8d2 |
| scripts/m2-head-volume-slim-v1/common.py | f6fead75bcd8fe1fd2cd6cea22592b1fa87cdccda5d2db2875789608c02de0dc |
| scripts/m2-head-attachment-readback-v1/readback.py | a45058f2d9644e88bd7518bddb198ce417a148470bfe1ca71198a502032f7f84 |
| scripts/m1b-assets/export-body.py | 3b37efb5babcf28cad6cfb2e5c605ce81e153c196ee38e1626045800f00d2a3c |
| assets-source/m2-head-volume-domain-v1/generated/endpoint-records.json | 0b8a30c6d4eb9971ac80c5fa880cbc98fb0619260d2ae6b759a549e824c8f005 |
| assets-source/m2-face-target-contract-v1/generated/source-male.json | 9f89671cfba1febc4ecc74f5922e78e75b1c23c8e67e386a1219d20a8fb8c87a |
| assets-source/m2-head-attachment-readback-v1/spec.json | ba21bf89b6e7eaa4da70d7394ae7b2e461d058c3b916c26edb334165262e1bf1 |
| prototype/node_modules/three/package.json | 87f2c99a8718e5fdd6f5e51427fde52c6075f2f698ddf8f7b4e162882df93940 |
| prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js | 532ac726e120039acbcd6cf54328c57acbf7b438176afaa6951257126d11bff1 |
| prototype/node_modules/three/src/renderers/shaders/ShaderChunk/morphnormal_vertex.glsl.js | a5833b2d2b8ffc70a4d9ff76a9ffeda6bf5c2754374cde6a3f32bc0899a3e30c |
| prototype/node_modules/three/src/renderers/shaders/ShaderChunk/normal_fragment_begin.glsl.js | 528bc133122cd63341c01e568b69a12034bfd6efb8ff031bb3d13e4bb09cbe2b |
| prototype/node_modules/@pixiv/three-vrm-materials-mtoon/package.json | 156b9c3e42ce70885f1c4d9844c6bc826e0c1ea3db73b6d2ef0c11ac2903bead |
| prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js | d5d0630c75204eb6c17ba4f01df4d5d38cbdfa6da225ff68b1784812fdef5292 |
