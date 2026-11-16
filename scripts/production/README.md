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

十一条入口共用既有命令索引；已有 `male-jaw-source`、`male-jaw-mouth`、`male-jaw-hair-fit`。没有运行命令的子命令、shell、自动导出或浏览器。`show`/`dry-run` 只输出参数和写入范围；`validate` 只读现有文件。工具或依赖缺失与源文件缺失分开报告。

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
