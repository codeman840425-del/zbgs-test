# Male FaceContour recipe reuse audit

- 审查日期：2026-11-17
- 范围：只读核对 `scripts/production/native_authoring`、`native_import`、`native_body_package`、`native_record_batch`、`native_import_bindings.mjs`，以及当前 male/native 源资产和归档回执。
- 操作边界：未创建模型，未启动 VRoid Studio，未修改 4196 工作台、运行时代码或现有资产。

## 结论

`native-authoring-batch-v1` 的**执行器和字段形状可以复用到男性基模**。它没有把性别写死在 schema 中，作者阶段按 `groupType` 重新发现当前文档的组 ID，按 `key`/`kind` 设置参数，并做即时回读、冷开回读、非目标参数保护和 VRM1 导出检查。

当前 `facecontour-pair.json` 与已发布 `native-parameter-batch-v2/batch.json` **不能直接复用**。两者的 template、观察回执、导出标题和候选身份均声明女性源。女性的 `.78/.48` 离散取值也不能从名称推断为男性合法值。男性必须有自己的 template SHA、`vroid_get_params` 观察回执和候选导出身份。

男性当前有 FaceShape 组和两个同名键的基线证据，但还没有本审查可用的男性非基线 FaceContour 观察或导出候选。因而目前只证明“schema 接缝可承载男性”，未证明男性 FaceContour 派生已生产、几何已适配、身体包已准入或运行时已接受。

## 当前事实和身份

| 事实 | 证据 |
| --- | --- |
| 女性 recipe 的 schema 和模板 | `scripts/production/native_authoring/facecontour-pair.json`，`native-parameter-batch-v2/batch.json`。女性 `.vroid` SHA `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de`，batch SHA `4665b65bb8c542247462ed7cbdc5b83055fa8450338c176d9200ff9fb54ad301`。 |
| 男性可用的原生编辑源 | `assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid`，SHA `c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a`。对应基础 VRM SHA `a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da`。 |
| 男性 FaceShape 组/参数基线 | `evidence/vroid-bridge-study-v1/params-FaceShape-216.json`，文件 SHA `d10d03fcdcc4c9d1aacb056184e84ff92a65d315a20e8ddb4d83641dd2c7fa2d`。`Level2FaceContour_ChinRoundness` 与 `Level2FaceContour_ChinFullCheeked` 都是 `kind: bone`，基线分别为 `0.6`、`0.3`。男性回执共有 23 项，其中包含 `kind: blendshape` 的 `FaceRound`，所以 recipe 仍须逐键核 `kind`。 |
| 男性 native 身体和衣物现状 | body SHA `7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81`。`assets-source/native-vroid-male-unmasked-base-v1/closure.json` 标为 `CPU-derivative-verified-not-factory-admitted`。`assets-source/native-vroid-male-equipment-v1/closure.json` 标为 `source-extraction-target-fit-and-actual-adapter-CPU-verified-not-factory`。 |
| 男性当前公开 staging 身份 | `prototype/public/assets/native-male-factory-v1/staging-manifest.json`，SHA `1280b4598e3d6fd6277aa36bcdce3f33d5a629c4cdfec331f0312b34e455629e`，状态 `exact-source-staging-not-game-or-visual-admission`。它不是 FaceContour 候选目录，也不是 runtime admission。 |
| 男性 coverage/equipment 现有回执 | `assets-source/native-vroid-male-body-texture-fit-v1/generated/manifest.json` SHA `c432a7cdd1f6f5e5af4bf07b79465b902f26c09b00f39254f206c2df24617143`，equipment SHA `e412188206670c9bf84b7f2019aab8a60778a2d0f6ac29df9d92091fd18d80a8`。这证明了一个旧 male source 的 CPU 绑定和覆盖候选，不能证明新 male FaceContour body SHA 的兼容。 |

## 可安全复用的 recipe/schema 字段

下表表示字段的**契约形状和执行语义**可复用。字段值必须换成男性本身的证据。

| 字段/语义 | 复用判断 | 约束 |
| --- | --- | --- |
| `schema: native-authoring-batch-v1` | 可复用 | `runner.checked_recipe()` 只接受该 schema。没有性别分支。 |
| `host.studio/plugin/unity` | 可复用 | 仍需与实际 status 完全相等。当前固定组合是 Studio `2.16.0`、`VRoidMcpBridge 0.15.0`、Unity `6000.0.62f1`。 |
| `template.path/sha256/version` | 字段可复用，值必须重建 | 必须指向男性 `.vroid` 的新路径、SHA 和版本。不能把女性 `311a…b4de` 复制到男性。每件仍从该模板字节副本开始。 |
| `parameters[].key/kind/groupType` | 键名和形状可复用，观察和基线必须重建 | 当前男回执证明两个 FaceContour 键存在且为 `bone`。`groupType` 可以保持 `TransferableGroupType.N00.Level1.FaceShape`，但每次打开仍按类型发现组 ID。 |
| `parameters[].observations[]` | 机制可复用，回执必须重建 | 每个回执必须是男性模板或其明确男性派生的 `vroid_get_params`，并以文件 SHA 固定。女性 `09-face-params`/`28-face-correct-params-after` 的回执不得作为 male 观察来源。 |
| `parameters[].baseline` | 字段可复用，值取男性回读 | 必须等于男性第一条观察值，并在实际打开男性 template 时再次匹配。当前男基线为 `.6/.3`。 |
| `items[].id/values` | 结构可复用，身份和值必须重建 | ID 仍按小写连字符规则，所有参数键必须齐全。每个值必须出现在该男性 recipe 的离散 observations 中。需要男性变体时，必须先获得男性的非基线观察，不得复制女性 `.78/.48`。 |
| `export` | 结构和导出检查可复用 | `version: 1`、`leave: true` 及 `EXPORT_SETTINGS` 仍可用。标题、`model_version`、作者和候选身份应为男性版本。 |
| `native-authoring-result-v1`、恢复快照、失败条目 | 可复用 | 每条继续独立输出、独立失败、保留 `failure-state.vroid`，完成后恢复进入文档或主菜单。 |

## 必须重建的男性适配

1. **男性 authoring batch**。复制 schema 结构即可，必须新建男性 template/observations/items/export identity。现有男性 FaceShape 回执只有基线，不能产生已证明的变化样件。男性非基线值应在 native editor 中实际设定、保存、冷开回读，再作为该 recipe 的 observation。预检必须拒绝缺少观察的非基线 item。

2. **按男性候选重新导出和差分**。`native_dependency_delta.py` 和 `prepare_native_batch.py` 依赖 `candidate.vrm`、`candidate.vroid`、冷开回执和导出 settings。女性 candidate、女性 sourceExport SHA、女性 delta、女性 geometry baseline/donor/mask 均不可借用。男性导出后需单独核 Face/FaceMouth/HairBack/Body 的顶点、morph、材质、图片、spring 和表达差分，差分结果决定下一层 adapter。

3. **男性身体包配置**。`native_body_package.resources()` 的 schema 是通用的，但当前配置中的 `template`、`baseline`、`donor`、`mask`、`authoringBatch`、`authoringResult` 全是女性。男性必须提供自己的六项 pin。`create()` 仍可复用 `check_body_uv()`、`bindings_and_buffers()` 和覆盖图生成，但它们要以男性候选为 body、重新生成同源 top/bottom/shoes GLB 和 coverage，更新 `compatibleAvatarSha256`、逆绑定、源节点和 floor。

4. **男性 package closure 和 importer spec**。`native_import.prepare()` 强制 body VRM、equipment、manifest、covered PNG、三件衣物共 7 文件闭包，且 material/MToon shade/image、PNG 尺寸、三槽和 SHA 均必须吻合。男性现有 `native-male-factory-v1` 只是 staging。新 FaceContour body SHA 变化后，旧 `7586…` 的 equipment 和 coverage 必须拒绝，除非它们对新 body 重新提取并逐文件绑定通过。

5. **男性运行时登记和记录**。`native_record_batch.plan()` 可复用 request 结构，允许 `entry.group == 'male'`，但只根据 catalog 的 body SHA、profile、recipe SHA、grip/presentation/glasses exact fit 和可选 readiness report 发请求。必须为每个新 male bodyType 写独立 profile/catalog entry 和 `recipeSha256`，再由 readiness gate 把 bodyType 放入 `acceptedForRuntime`。当前 staging/CPU 资产不能直接发最终记录请求。

6. **男性配件和动作适配**。FaceContour 会改变脸部/发际几何。眼镜 temple、麦克风口端和握姿、发丝动态、表情/口型、坐起和走跑接触都按新 body SHA 查找。现有 `native-male-7586-v1` 的 fit 不能按性别或同骨架自动转给新 SHA，需按实际 candidate 逐项重新生成或明确拒绝。

7. **许可和元数据**。男性 VRM 的现有 meta 保留 `onlyAuthor`、`personalNonProfit`、`allowRedistribution: false`、`modification: prohibited` 等限制。男性 recipe、导出和 package 必须继续保留来源和限制，不得把内部技术候选当作可分发或商业资产。

## 明确拒绝条件

以下任一条件成立时，authoring/package/record 入口应拒绝并保留诊断产物。

- template 是女性路径或 SHA，或男性 `.vroid` 的 SHA 与 recipe 不一致。
- 参数 observation 不是该男性 template/派生的 `vroid_get_params` 回执，证据文件 SHA 不匹配，或回执中 key/kind 缺失、重复或类型改变。
- `groupType` 在男性文档中不存在或多于一个，参数 key 在 fresh group 中不存在或多于一个。不能把女性固定 group ID 传给男性。
- `baseline` 不等于男性第一观察值，或实际打开男性模板的初始值不匹配。
- item 使用 `.78`、`.48` 等仅在女性 observations 中观察到的值，而男性 recipe 没有自己的同值 observation。`runner.checked_recipe()` 会以 `Value outside observed discrete choices` 拒绝。
- 只替换 `template` 字段，继续使用女性 `candidate.vrm`、`candidate.vroid`、delta、baseline、donor、mask、coverage 或三件 garment。
- male equipment 的 `compatibleAvatarSha256`、garment SHA/bytes、raw skeleton/joints、inverseBindMatrix、coverage material/image/PNG 尺寸任一不匹配新 candidate body。
- package 不是 body + equipment + manifest + covered PNG + top/bottom/shoes 三件衣物的精确闭包，或存在额外/缺失文件、链接路径、覆盖文件差异。
- catalog profile 的 `id` 与 `bodyType` 不同、body URL/SHA 不一致、`recipeSha256` 缺失，或 readiness report 未列入该精确 bodyType。`native_record_batch` 应继续省略不精确的 mic/glasses fit，并拒绝 runtime-pending body。
- 依赖 male body SHA 的 fit、表情、头发、接触或普通设备检查没有新证据。仅同为 male、同 humanoid、同版本工具或同名参数不足以继承。
- 违反 VRM source metadata 的修改、再分发或商业用途限制。

## 离线测试依据

以下命令均为离线单测，未启动 native editor、浏览器或运行时。第一条从项目根目录运行，其余四条从 `F:/gamemake/scripts/production` 运行。

- `python -B scripts/production/native_authoring/test_runner.py -v`：12 项通过。覆盖模板隔离、组 ID 重新发现、颜色/骨参数传输、未声明联动拒绝、冷开不一致、失败保留和恢复停止。
- `python -B -m unittest test_native_import -v`：7 项通过。覆盖 body 缺失/错 SHA、目录逃逸、绑定损坏、失败兄弟保留、已有输出字节一致和重试。
- `python -B -m unittest test_native_body_package -v`：3 项通过。覆盖真实包重建、错误 source identity 隔离和覆盖 PNG 错误拒绝。
- `python -B -m unittest test_native_record_batch -v`：6 项通过。覆盖精确 body SHA、重复 body、readiness gate、坏 body 和未知 grip fit 的拒绝/省略。
- `python -B -m unittest test_prepare_native_batch -v`：3 项通过。覆盖 authoring result/导出回执绑定及失败 item 阻止 ready config。

这些测试证明共享执行器和身份门的离线行为，未证明男性 FaceContour 已实际制作、导出后的男性几何/表情/装备/动作视觉通过，也未把当前 male staging 资产升级为 factory/runtime accepted。

## 审查引用

- `scripts/production/native_authoring/README.md`
- `scripts/production/native_authoring/runner.py`
- `scripts/production/native_authoring/facecontour-pair.json`
- `scripts/production/native_import.py`
- `scripts/production/native_import_bindings.mjs`
- `scripts/production/native_body_package.py`
- `scripts/production/native-body-package-v1.json`
- `scripts/production/native_record_batch.py`
- `assets-source/native-vroid-male-unmasked-base-v1/closure.json`
- `assets-source/native-vroid-male-equipment-v1/closure.json`
- `assets-source/native-vroid-male-body-texture-fit-v1/generated/manifest.json`
- `prototype/public/assets/native-male-factory-v1/staging-manifest.json`
- `docs/PRODUCTION-PARAMETER-CONTRACT.md`

审查产物仅为本静态文档。未修改上述引用文件。
