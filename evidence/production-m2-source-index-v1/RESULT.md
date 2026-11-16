# 已有 M2 源流程登记

基线：`8e72d67e4d7250a2a1146d90d81fa699b3865cbe`。仅修改 `scripts/production` 并新增本证据目录；未改产品、源包、公共资源或发布入口。

新增 `male-jaw-source`、`male-jaw-mouth`、`male-jaw-hair-fit` 三条命令索引。原五条声明逐值不变，校验逻辑不变。三种包分别使用 `files`、`files+dependencies`、`retainedFiles+inputFiles`；各包清单本身也固定 SHA，不以可修改清单自动接受新版本。

## 实际结果

- 八条现存源/导出身份校验通过；新增三条分别观察 34、48、44 个独立文件 pin。
- 原负例保留并通过；新增 13 个内存故障注入被拒绝，覆盖各包错误清单版本、缺源、损坏导出，及下颌重复导出凭据、嘴宽错误范围、同 GLB 错 fit 版本/身体。
- 所有受测源和包清单中的源/输出文件前后 SHA 不变；详细列表在 `source-package-check.json`。
- `command-source-check.json` 保存真实命令脚本身份和静态参数/写入审查范围。没有执行索引内的导出或写入型 check，没有 Blender、浏览器或公共安装。

## 边界与恢复

`validate-all.json` 是现存字节/结构回读，不是重新制作、几何门、游戏加载或观感验收。男 jaw 源包中的历史 runtime-pending、嘴包 runtimeAdmitted=false 和头发几何报告的静态限制原样保留；当前已完成的游戏证据不被本索引替代，也不据历史字段倒退当前能力。

男 jaw 固定 generated/rebuild 报告与四次保存导出一致；嘴宽仅 0/+4%，原 addon POSITION 与 final NORMAL 身份分别保留；短发复用原生产 GLB，但独立 fit ID/version/body 必须相符。头发 editable 再导出的 NORMAL 与生产 GLB 已知差异未消除，不能互换。

旧 check 不是都只读：男 jaw audit/check-fit 写报告，嘴 audit 写 recipe，头发 check 还写 public。索引已列其写入范围与固定路径限制；`dry-run` 只是展示，不运行。新输出路径不表示旧固定 audit 自动接受新路径。

恢复时按失败指向的资源路径取回对应提交的准确字节，不修改 manifest 来“修复”失败。缺本地 Blender/addon/numpy/scipy 影响独立重制，不影响标准库读取保存产物；报告没有宣称这些工具已安装。

## 复跑

在包含本增量的完整检出根目录执行，下列输出应写到新的证据目录，不覆盖本次原记录：

```powershell
python -B scripts/production/flow.py validate all
python -B scripts/production/flow.py dry-run all
python -B scripts/production/qa-flow.py
python -B scripts/production/qa-source-packages.py
```

`executed/` 保存本次脚本/配置，`manifest.json` 固定本次证据与脚本身份。此增量补齐已有制作入口，不构成随机批量生产实现。
