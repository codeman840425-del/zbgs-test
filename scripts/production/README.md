# 制作流程只读索引

从仓库根目录运行：

```powershell
python scripts/production/flow.py list
python scripts/production/flow.py show male-jaw-source
python scripts/production/flow.py dry-run male-jaw-mouth
python scripts/production/flow.py validate all
python scripts/production/qa-flow.py
python scripts/production/qa-source-packages.py
```

九条入口共用既有命令索引；已有 `male-jaw-source`、`male-jaw-mouth`、`male-jaw-hair-fit`。没有运行命令的子命令、shell、自动导出或浏览器。`show`/`dry-run` 只输出参数和写入范围；`validate` 只读现有文件。工具或依赖缺失与源文件缺失分开报告。

新增三包清单 SHA 固定在 workflows.json。男下颌包核文件及原始基模、独立重建/重复导出的身份；嘴包核 files/dependencies、精确 jaw 基模与仅 0/+4% 配方及最终 NORMAL 产物；头发包使用 evidence 下的包清单，并核同 GLB 的独立 fit ID/version/body、挂点及 public 三文件。头发目录的 manifest.json 是运行时描述，不能当文件清单。

索引明确登记历史写入步骤：male face `audit.py`/`check-fit.mjs` 写报告；嘴 `audit.py` 还写 recipe；头发 `check.py` 还安装 public。它们不是只读命令，索引绝不执行。自定义 `workflow-rebuild` 是需要人工选定的独立输出，固定 generated/rebuild 的旧 audit 不会自动转向它。不要在冻结包上执行旧写入命令；应在独立检出中复做并单独审查结果。

失败先按输出路径恢复确切源/导出字节，再重跑 validate；不可重写 manifest 来消除错误。Blender 4.5.9、VRM addon 4.10.5 与 numpy/scipy 等仅为相应重制命令的前置条件；只读索引本身只需 Python 标准库，未检查本机 addon 是否已安装。阴性用例在内存注入错误版本、缺源和坏导出，不改冻结资产。

本检查不重算形变/法线，不运行游戏，也不建立随机批量生产能力。历史源包中的 runtime-pending 字段原样保留；当前能力以 docs/CAPABILITIES.md 及对应固定游戏证据为准。头发 editable 导出和生产 GLB 的已知法线差仍保留，不能用前者替换后者。

男性外搭入口 `male-outer-panels-source` 登记原男性身体、原上衣、独立裁片 spec、来源、可编辑源及 author-equipment/fit。`show` 展示生成、Blender 两次回开导出、独立目录静态检查、固定源 finalize 和 install-runtime 的完整写范围及前置条件。`workflow-rebuild` 须为不存在的目录，失败保留后另选目录重试。固定源 finalize 会替换源 manifest/fit/回执，install-runtime 会写 public 清单和实物，二者都只登记供隔离检出手动使用。

该包 manifest 的 files 路径相对包根。只读核验检查完整114文件清单、spec/generator、实际 source GLB 的9骨绑定、fit版本/身体/内层/两种下装限制、generated/rebuild重复导出，以及游戏清单与实际 public GLB。运行实物来自 author-export SHA 0631cf9d1ec297e8504d5ed73f5e1325d3154be9de09906bb6e7131488e89330，参数模式 GLB 的 ef9171d06988941332b53c6d0636513aa6e1f9a4fbdae92b3696cb6b966c836b 保留独立身份。静态报告和历史 pending 字段保持原记录，连续动作视觉适配仍须对应版本审查。
