# 制作流程只读索引

单资产成本准入与超限退出状态见 [ASSET-BUDGET.md](ASSET-BUDGET.md)，入口为 `asset_budget.py check`，预算固定为 `m2-technical-v1`。

从仓库根目录运行：

```powershell
python scripts/production/flow.py list
python scripts/production/flow.py show male-jaw-source
python scripts/production/flow.py dry-run male-jaw-mouth
python scripts/production/flow.py validate all
python scripts/production/qa-flow.py
python scripts/production/qa-source-packages.py
```

十七条入口共用既有命令索引；已有 `male-jaw-source`、`male-jaw-mouth`、`male-jaw-hair-fit`。没有运行命令的子命令、shell、自动导出或浏览器。`show`/`dry-run` 只输出参数和写入范围；`validate` 只读现有文件。工具或依赖缺失与源文件缺失分开报告。

新增三包清单 SHA 固定在 workflows.json。男下颌包核文件及原始基模、独立重建/重复导出的身份；嘴包核 files/dependencies、精确 jaw 基模与仅 0/+4% 配方及最终 NORMAL 产物；头发包使用 evidence 下的包清单，并核同 GLB 的独立 fit ID/version/body、挂点及 public 三文件。头发目录的 manifest.json 是运行时描述，不能当文件清单。

索引明确登记历史写入步骤：male face `audit.py`/`check-fit.mjs` 写报告；嘴 `audit.py` 还写 recipe；头发 `check.py` 还安装 public。它们不是只读命令，索引绝不执行。自定义 `workflow-rebuild` 是需要人工选定的独立输出，固定 generated/rebuild 的旧 audit 不会自动转向它。不要在冻结包上执行旧写入命令；应在独立检出中复做并单独审查结果。

失败先按输出路径恢复确切源/导出字节，再重跑 validate；不可重写 manifest 来消除错误。Blender 4.5.9、VRM addon 4.10.5 与 numpy/scipy 等仅为相应重制命令的前置条件；只读索引本身只需 Python 标准库，未检查本机 addon 是否已安装。阴性用例在内存注入错误版本、缺源和坏导出，不改冻结资产。

本检查不重算形变/法线，不运行游戏，也不建立随机批量生产能力。历史源包中的 runtime-pending 字段原样保留；当前能力以 docs/CAPABILITIES.md 及对应固定游戏证据为准。头发 editable 导出和生产 GLB 的已知法线差仍保留，不能用前者替换后者。

男性外搭入口 `male-outer-panels-source` 登记原男性身体、原上衣、独立裁片 spec、来源、可编辑源及 author-equipment/fit。`show` 展示生成、Blender 两次回开导出、独立目录静态检查、固定源 finalize 和 install-runtime 的完整写范围及前置条件。`workflow-rebuild` 须为不存在的目录，失败保留后另选目录重试。固定源 finalize 会替换源 manifest/fit/回执，install-runtime 会写 public 清单和实物，二者都只登记供隔离检出手动使用。

该包 manifest 的 files 路径相对包根。只读核验检查完整114文件清单、spec/generator、实际 source GLB 的9骨绑定、fit版本/身体/内层/两种下装限制、generated/rebuild重复导出，以及游戏清单与实际 public GLB。运行实物来自 author-export SHA 0631cf9d1ec297e8504d5ed73f5e1325d3154be9de09906bb6e7131488e89330，参数模式 GLB 的 ef9171d06988941332b53c6d0636513aa6e1f9a4fbdae92b3696cb6b966c836b 保留独立身份。静态报告和历史 pending 字段保持原记录，连续动作视觉适配仍须对应版本审查。

## 运行候选查询与准入（086，现有配方范围）

共用模块 `prototype/src/appearance-candidates.js` 导出 `queryAppearanceCandidates(controller)` 与 `admitAppearanceCandidate(controller, record)`；当前工作台的 `__debug` 同名入口供agent调用，不依赖新增UI。query返回当前加载基模的默认v6配方、真实范围/离散值、颜色、发型及fit身份和已配置装备集合；输出为独立副本，查询不取消在途修改。

```javascript
const choices = __debug.queryAppearanceCandidates();
const record = structuredClone(choices.defaultRecipe);
const result = __debug.admitAppearanceCandidate(record);
if (result.accepted) await __debug.importAppearanceRecipe(JSON.stringify(record));
```

`accepted`只表示静态元数据匹配；真实字节、几何/表情、蒙皮和绑定仍由实际prepare检查。未知字段、错误身份或不兼容值返回issues内field/code/reason，不夹紧或删除请求内容。不是完整形体依赖、任意输入格式或正式角色存档接口。

实际查询输出、错误输入与运行结果见evidence/m2-candidate-admission-browser-086-v1及m2-static-admission-baseline-1fa-v1。复现检查：`node scripts/qa-candidate-admission-browser.cjs <固定URL> <准确build> <新证据目录>`，需已构建的Node/Playwright依赖和Chrome；失败保留原目录，不覆盖历史。它是真实浏览器检查，需独占当前GPU验证窗口。

连体服入口为 `male-onepiece-source`。只读回读核 61 文件源清单、原男来源、实际作者 GLB 的 16 骨绑定、7 mm 初版到 9 mm 编辑源、generated/repeat 四次实际回开导出和安装 entry。运行 `fitResource` 同时核 source 与 public fit 的真实字节，不能把 pattern GLB 或未改源版本替代实际作者导出。

衣层覆盖入口为 `male-garment-coverage-source`。只读回读核 coverage package 清单、原男身体、原男 top primitive 0、真实 outer author-export、56 个 top face identity、source/public descriptor SHA、外搭 runtime SHA 以及已保存的 CPU 几何和生命周期证据。`build.py` 只重算已固定参数的 CPU mask，`install-runtime.py` 只复制已核 SHA 的 descriptor。原始 body/top/outer/equipment GLB 是保护输入，readback 不运行 producer、Node、Blender、GPU 或浏览器。

`show`/`dry-run` 明示 build、author、audit、finalize 和 install 的写范围。build 的原男 exporter 依赖会确保既有 m1b 目录存在，输出实物仍只写独立目录。安装器还可能写 `equipment.install.tmp` 后替换原清单。固定 finalize 读取 generated/repeat 并重写包清单，不会推广 workflow-rebuild；这些步骤只声明，不由索引执行。已有 44 对身体交叉、368 对自交及近面采样深度保留为静态诊断，查询通过不代表动作、坐姿或视觉验收。

可选格式诊断：顾问已独立安装官方 gltf-validator 2.0.0-dev.3.10。三个现有准确SHA报告归档于 docs/research/gltf-validator-pilot-2026-11-16；不重跑pilot，不追求零warning。仅新导出字节或实际格式疑点时使用该目录README记录的check.cjs入口。它不验证VRM扩展/fit/动作，不替代本索引与asset_budget，也不是构建所需外部依赖。

成对耳饰生产入口为 `paired-ear-accessory-source`。输入是参数 spec 与精确原男女 VRM，产物为共用 stud GLB、独立左右语义挂点及男女 fit、重复导出和实际半径变体。只读查询使用 `python -B scripts/production/flow.py show paired-ear-accessory-source`，核验使用同入口 `validate`。原过程源与新几何许可为 CC0-1.0，原 VRM 来源许可继续适用。

登记顺序为隔离检出的 build、qa、publish。qa 会再次调用 build 并重写整个 generated、qa-report 和 package-files，publish 核完整清单后只发布 manifest、stud 和两个 fit，逐文件临时写入且最后发布 manifest。同源重复 publish 不改已有相同文件，任一已有文件不同则预检拒绝。源制作需要锁定 numpy 2.4.2，实际报告 Python 3.13.11。CPU runtime 检查另需 prototype 锁文件安装的 Three/esbuild，其 OS 临时发布目录和清理行为已在命令备注说明。

索引核 18 文件源清单、两基模 SHA、fit 身份与侧别、pair fixture、实际参数变体半径及已保存 CPU 表面采样报告。public 目录存在时核全部四文件精确字节，缺少目录时报告 `publishedBytesMatchSource=false`。`runtimeAccepted=false` 保留源记录，运行与观感需对应固定版本证据。定向无写入回归为 `python -B scripts/production/qa-paired-ear-package.py`，覆盖重复查询/回读一致、坏导出、错误 fit 身份、重复侧别、许可与 QA 误报。

薄袜入口为 `socks-layer-source`。`show`/`dry-run` 列出 CPU build、qa 与 publish 的完整写范围，`validate` 只读核25文件源清单、原男女Body、实际六骨绑定、源fit/QA及所有旧装备、材质配方、fitResource依赖SHA。源原24文件保持原字节，清单显式加入publisher后更新其固定SHA。

`python -B scripts/m2-socks-layer-v1/publish.py` 先预检完整计划，再发布新目录两GLB及source manifest，最后逐文件原子更新原m1/m1b装备清单。只追加对应socks条目，GLB URL绝对指向新目录；原entry及其相对URL、材质配方/fitResource、顶层元数据与顺序保留。已有socks ID必须深度完全相等。这样原profiles与v6 manifestUrl继续使用既有路径。其余原装备GLB、Body和冻结资产是保护输入。中断可能留下部分新文件，可用同源重复发布继续，每文件原子性不代表跨文件事务。

定向回归为 `python -B scripts/production/qa-socks-package.py`，只在OS临时镜像内测试发布/重复/冲突和完整预检，主仓资源不写入。source-only QA保留runtimeAccepted=false，原女性Body长袜贴图与已有鞋/男长裤交叉诊断保持；运行、恢复及观感仍需固定版本证据。

小腿比例入口为 `lower-leg-proportion-source`。只读回读固定24文件清单，另钉住后来加入的 publisher SHA，不改写源清单。核原男性 Body、可编辑检查点、派生 Body 和双侧固定 +20 mm、三件装备的实际绑定与独立 fit。鞋重新变形并重绑脚部，上衣和短裤保留原 GLB 字节，使用派生 Body 专属 fit，旧材质配方未继承。前臂 profile 保留原测量数据，核原 profile SHA、上身原始骨骼/几何/权重/绑定等价证据及派生 profile 身份，发布七文件逐一核实源字节与实际绝对 URL。

隔离检出重做顺序为 `build.py`、`qa-upper-fit.py`、`node qa-vrm.mjs`、`qa.py`、索引 `validate lower-leg-proportion-source`，再 `publish.py`。前三个 Python 制作/检查脚本使用 `python -B scripts/m2-lower-leg-proportion-v1/<脚本>`，Node 同目录入口使用锁定 prototype 依赖。`qa.py` 会重跑 build，并刷新生成物、QA 和清单，须在上身与 loader QA 后运行。publisher 在任何目标写入前逐项核源清单 SHA/字节与三份 QA passed，再预检身体/装备/profile 身份及全部已有输出字节。索引另固定清单版本。它仅向独立发布目录写七文件及临时文件，逐文件原子发布，相同源可恢复中断。失败保留错误与原身份，不冒用旧 Body/旧 fit。`python -B scripts/production/qa-lower-leg-package.py` 做只读回读、内存阴性注入和 OS 临时镜像内的重复发布及源清单/失败 QA 拒绝验证，运行、足底接触、坐姿和观感验收均待对应固定游戏证据。

色层入口为 `surface-layer-source`。只读validate核固定24文件源清单（既有23项加root publisher）、原男女VRM/实际Face_SKIN几何与UV、map/shade源图片编码SHA及已保存RGBA像素SHA证明、两层独立参数/保护区/输出冲突CPU证据，最后比对公开目录完整11文件。公开文件集合含manifest、4张overlay、4张region mask及2张protected mask。源标记runtimeAccepted=false保持，本次为作者自查，独立游戏观感依据仍取对应固定版本证据。

制作依赖Python3.13、numpy2.4.2、Pillow12.1.0；索引和publisher只用标准库。默认build只接受缺失或同字节输出，改源时用 `--spec <新源参数相对路径> --out assets-source/m2-surface-layer-v1/exports/<新目录>`。复核新产物身份后再显式推广，不能改旧清单来掩盖源篡改。完整qa会重写报告和源清单并自动纳入publisher，所以清单SHA变更必须显式更新索引。qa-output先行，完整qa后行。

索引列出默认及独立out写范围，qa的临时无效参数输入用源包tmp*.json前缀，publisher用目标父目录.surface-stage-*暂存后整目录rename。writes中的星号声明临时名称前缀，只读索引不展开或执行它们。publisher先核源清单和passed QA，再构造11文件payload；已有完整同字节版本幂等，不同或不完整版本需新输出/版本。`--output`显式另选目录时，staging随目标父目录移动。

`python -B scripts/production/qa-surface-package.py` 做作者定向自查，首次/重复发布与源篡改、失败QA、目标冲突拒绝只在OS临时镜像中调用原publisher，不重建PNG、启动浏览器或使用GPU。

长发入口为 `long-hair-source`。固定26项清单沿原25项只加入root publisher，旧清单身份保留Git历史。只读validate核原女Body与真实raw-head inverse bind、既有三角诊断helper SHA、691v/1322t/8骨及实际混权、官方3.5.5 API smoke、静态近接触、一次改长导出和原失败实物。运行发布固定为generated下GLB/fit/manifest三文件，逐字节比对当前public。额外exports、原失败或changed-length实物不能自动成为运行候选。

制作依赖Python3.13/numpy2.4.2/Pillow12.1.0；实际CPU loader使用prototype锁定Three187及springbone3.5.5，索引和publisher只用标准库。独立重建用源build的有界 `--out assets-source/m2-long-hair-v1/exports/<新目录>`，同字节不重写、不同字节拒绝。后续revision共存时在固定原提交的隔离检出重跑v1写入QA，保原26项清单，日常使用只读validate。

writer顺序为build、Node qa-runtime、Python qa；最终qa只在内存计划/重复生成并写QA及package-files，枚举会纳入publisher。first failure文件仅缺失时创建，写范围已声明。publisher完整核源清单和两份passed QA，再核asset/fit身份，以同级.hair-stage-*暂存后整目录rename发布三文件。同字节release幂等，不同或不完整release须另选输出/版本。`qa-long-hair-package.py` 在完整OS临时镜像内验证首次/重复发布和失败QA、损坏fit/GLB及冲突目标零写入，原source/runtime/public不变。该检查由源作者完成，动态和观感依据对应固定游戏证据。

同一 `long-hair-source` 入口同时登记 `rootjoin-v2`，原26项清单保持原SHA。修订版独立固定16项清单，另固定后加入的 `publish-rootjoin-v2.py` SHA及其精确 manifest guard。只读核对原版来源、609顶点/1162三角、原骨骼与inverse bind、完整原physics/attachment合同、新asset/fit/manifest SHA、静态/CPU/输出QA及独立public三文件。`attempt-1/2`保留在修订清单供追溯，不能替代发布根目录的已登记实物。返回资料保持 `runtimeAccepted=false` 与观感未建立。

修订制作入口是 `python -B scripts/m2-long-hair-v1/rootjoin-v2.py`，有界重建可追加 `--out assets-source/m2-long-hair-v1/revisions/rootjoin-v2/exports/<新目录>`。源几何失败仍可能在固定revision目录写 `attempt-3`，同字节不重写、冲突拒绝。接着在精确修订源检出使用 `node scripts/m2-long-hair-v1/qa-rootjoin-v2.mjs`，它先调用Python producer重复检查，再写CPU报告并递归枚举revision，故写范围包含整个revision，额外exports不能混入冻结16项清单。日常只读核验使用 `flow.py validate long-hair-source`，不要在共存修订的共享树运行原递归 `qa.py`。`publish-rootjoin-v2.py`复用原原子发布器，默认发布至独立 `/assets/m2-long-hair-rootjoin-v2`，完整检查与三个精确实物不变。`python -B scripts/production/qa-long-hair-revision.py`只执行本入口回读、少量内存阴性及临时镜像发布/重复/冲突/失败QA拒绝，证据写 `evidence/m2-long-hair-revision-production-v2`，不重制资产或运行历史全套QA。


帽子与发型共存入口为 `hat-hair-source`。只读核冻结27文件清单、原女性身体、精确rootjoin-v2发型manifest/fit/实物、2238顶点/4472三角的实际双刚性网格、source-author静态/真实loader CPU报告和已保存帽檐+10mm编辑证据。首次失败和帽檐变体都保留来源身份，发布只取generated三件ready实物。fit中的repo路径只用于来源追溯，运行资源使用manifest的绝对 `/assets/` URL，原头皮和完整头发保持来源合同。

制作顺序与完整写范围见 `flow.py show hat-hair-source`。build、qa-runtime与递归qa仅登记供精确源隔离检出重做，不在冻结主源上重跑扩清单。本次顶层 `scripts/publish-hat-hair-v1.py` 放在递归枚举范围外，并独立固定SHA。发布前核整个清单、QApassed、三个ready SHA和实际依赖，再在目标同级 `.hat-stage-*` 暂存并整目录rename。默认仅发布 `prototype/public/assets/m2-hat-hair-v1/{baseball-cap.glb,fit.json,manifest.json}`，相同完整发布不改字节或mtime，不同或部分已有目录拒绝。源文件缺失、坏身份或QA失败均在目标写入前拒绝。

限定复核命令为 `python -B scripts/production/flow.py validate hat-hair-source` 和 `python -B scripts/production/qa-hat-package.py`，实际发布入口为 `python -B scripts/publish-hat-hair-v1.py`。focused QA仅使用临时镜像测试发布/重复/冲突/坏源，语义字段阴性采用明确的内存注入，报告写 `evidence/m2-hat-production-v1`。源27项清单原样保留，静态及CPU结果继续 `runtimeAccepted=false`，不代表浏览器、长发动态、表情视线、椅子接触或观感验收。


### Native batch admission cycle

`native_admission_cycle.py` 收口已准备的 native import batch：先按精确 body/package/adapter 证据评估 `native_batch_gate.py`，再把同一份 gate report 交给 `native_record_batch.py`。只有 `acceptedForRuntime` 中的 body 才会得到角色创建请求；未准入项会留下带原因的拒绝行。该入口拒绝覆盖已有输出，且只证明生产与记录链路，不授予视觉或目标设备性能通过。示例：

```powershell
python -B scripts/production/native_admission_cycle.py `
  --batch assets-source/native-parameter-game-packages-v1/import-batch.json `
  --gate-output evidence/<cycle>/gate.json `
  --records-output evidence/<cycle>/record-requests `
  --summary evidence/<cycle>/summary.json `
  --runtime-report <runtime-report.json> `
  --adapter-report <adapter-report.json> `
  --microphone-report <microphone-registration.json> `
  --adaptation-report <adaptation-admissions.json> `
  --runtime-head-audit <runtime-record-budget-head-attachment-audit.json> `
  --glasses-report <exact-glasses-admission.json>
```

`--glasses-report` 是可选的强准入输入，必须是
`native-glasses-admission-v1`，同时声明精确 body/profile/accessory SHA、正常运行、关闭重开和人工视觉检查均通过；candidate-only、`verified:false` 或 legacy
捕获会被拒绝。它只清除对应身体的 `headAttachments`，不会放宽动态、表面、预算或普通电脑检查。

`--budget-report` 同样是可选强准入输入，必须是 `native-budget-admission-v1`，并且同一 body/record 的 transport、decode/Canvas、GPU 生命周期和 ordinary-PC 四层均为 `passed`；当前静态超预算和未测普通电脑报告只能保留为 blocker。
