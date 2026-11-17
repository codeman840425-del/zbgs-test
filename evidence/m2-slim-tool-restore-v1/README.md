# 固定SLIM工具依赖恢复入口

旧 `scripts/m2-slim-tool-smoke-v1/prepare.py` 同时检查原TOOL目录和旧prepare-report是否存在。prepare-report已被保留在版本库，干净检出缺少未跟踪venv时仍会被旧回执阻止。原smoke回执和源码继续保留其历史身份。

新入口为 `scripts/m2-slim-tool-restore-v1/restore.py`。它读取原固定requirements.lock和官方wheel回执，分别校验SHA `a145e1c66a487280b092d6730ae50f29bb1e9c814ce4306e357af8b7587476ae`、`d46bcf857802c6207a15dc9867addc93148f80b58dc563962aaa36dc12551027`。恢复是否允许只取决于显式新目标路径，旧历史回执存在不会阻止新目标。已有目标始终拒绝，失败部分目录保留，可另选新目录定位恢复。

## 使用

前提为已安装CPython3.13 Windows x64。此入口恢复三项工具依赖，系统Python安装与其他工程依赖另有其恢复职责。

在无该工具目录的干净检出中，以下命令把工具恢复到后续旧脚本约定的固定路径，原prepare-report可以继续存在。

```powershell
python -B scripts/m2-slim-tool-restore-v1/restore.py --target experiments/tools/slim-core-2.6.3
```

本机该目录正在使用，入口会拒绝覆盖它。本次实际验证选择独立目录。

```powershell
python -B scripts/m2-slim-tool-restore-v1/restore.py --target evidence/m2-slim-tool-restore-v1/validation-network-01
```

有已留存wheel时可增加 `--wheelhouse <只读wheel目录>`。入口在创建目标前逐wheel核SHA，再复制到新目标安装。目标已有但只有旧wheelhouse/失败文件时，保留其目录并选择新目标；如需恢复原固定路径，应先停用并归档旧目录，再将原路径作为新目标。当前在用环境没有执行这类移动。

默认从原prepare-report中精确记录的files.pythonhosted.org官方URL下载，无版本解析或升级。三包全部先核文件尺寸和锁定SHA，再创建不含system-site-packages的venv。安装命令使用venv解释器的isolated pip、no-index、only-binary、no-deps、require-hashes，后续import使用Python isolated模式。全局pip没有用于安装。

| 包 | 固定版本 | wheel SHA256 |
| --- | --- | --- |
| libigl | 2.6.3 | 1d91745ed0e78c56a04539e3231ce6faff49ae0dbe123caa2034e1886fcb2e7d |
| numpy | 2.4.2 | 7df2de1e4fba69a51c06c28f5a3de36731eb9639feb8e1cf7e4a7b0daf4cf622 |
| scipy | 1.18.1 | 559ed65f60c1af5a03f3912605a1b5114f522c7c32fb23c3376ae8f03219fe28 |

原wheel-notices及许可元数据身份沿旧prepare-report.notices。实际固定libigl wheel同时带MPL2/GPL声明及可选模块，本次import仅igl/core，完整wheel的产品分发许可结论没有扩大。

## 实际验证

空validation-network-01目录通过官方网络下载、hash验证、venv安装和import/API符号检查，总59.8708s。实际未使用旧wheelhouse或在用venv。验证版本为libigl2.6.3、NumPy2.4.2、SciPy1.18.1，include-system-site-packages=false，所有import路径均落新venv。

实际slim_precompute/slim_solve符号存在并可调用，保存了原docstring；本次没有调用它们，没有构造tet或角色形状，没有训练、编译、tetgen/cgal或GPU。该检查只证明工具依赖可恢复和导入。

140个新装pyd/dll的相对路径及SHA与原固定wheel安装逐项相同。原在用环境和原lock/回执等144个选定文件前后SHA未变，明确文件范围见existing-tool-before.json。全局解释器当前仍找不到igl。

负例已保存，旧在用目标拒绝、坏wheel拒绝且目标未创建、重复新目标拒绝且其restore/import回执未变。validation-report.json关联实际restore-report/import-report；原命令输出、下载来源、hash及安装日志保留。失败场景没有改锁、换包或自动重试。

这是保留旧已跟踪回执情况下的全新目标恢复实测，覆盖工具安装前置。新操作系统/CPython配置和整个游戏仓库重建没有在本包测试。未来网络或该精确wheel不可用时，入口保留具体失败，不能由本次成功推定未来仍可在线获取。

新venv和wheel归档留在临时验证目录，受本目录.gitignore排除，源码与文字回执可独立收录。撤销该验证安装可在停止使用后删除其独立validation目录，在用旧工具目录保持原样。本包未改共享docs或提交主树。
