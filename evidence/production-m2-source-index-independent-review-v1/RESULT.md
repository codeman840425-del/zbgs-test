# 生产源索引独立审查

结论：cacbc0d（原 e42e86b）只读验证路径没有发现执行导出或扩大运行验收的漏洞；发现一处实际写入范围漏报，已在独立审查工作树修正并通过针对回归。尚未自动合入主线。

## 发现与修正

`male-jaw-hair-fit` 的历史 `check.py` 会先调用 `rebuild-original-geometry.py`（执行原生成器写 fresh/original-hair-rebuild），再调用 `build.py --out fresh`；还写 original-generator-rebuild.json。原索引虽说明 PUBLIC INSTALLER，却漏列 `assets-source/m2-male-jaw-hair-fit-v1/fresh/` 与 `evidence/m2-male-jaw-hair-fit-v1/original-generator-rebuild.json`。因此原版不能称写入声明完整。

修复只给 workflows.json 对应命令追加这两个 writes，并明确它会重建而不是仅检查。新增 qa-source-write-scope.py 只读取现有脚本文本，确认具体调用/输出锚点；内存移除任一写入声明必须拒绝。它不是通用静态分析器。没有运行任何该导出/check 安装器，也未改其源码。

## 实际复核

- 原五条 workflow 对象与 cacbc0d 父提交逐值完全一致。flow.py 仅新增 source-package 分支，原分支主体不变。
- 原版本执行 qa-flow.py 与 qa-source-packages.py 均 exit 0：8条真实只读回读、原9与新增13内存拒绝用例通过。原输出原样保存，不换修复版标签。
- 修复版 qa-source-write-scope.py 通过，并明确拒绝两种漏写声明。
- 用独立工作树 flow/source_packages/workflows 读取主树冻结资源，再次8条回读通过。脚本根与资源根在 fixed-readback.json 明确分开；没有声称稀疏检出自带全部资产。
- 三包 package manifest SHA 固定配置，逐文件/依赖SHA和字节检查；错版本/缺源/坏导出均拒绝。头发检查的是独立fit/body与相同GLB关系，不把相同GLB当fit通过。嘴端点只0/+4，原NORMAL导出身份检查不重算法线。
- show/dry-run只序列化命令，validate只读取文件；无subprocess/eval/导出器导入。新source_packages只用json和传入验证器。Python以-B运行，未写产品或资产。
- 手工核过三条命令的--out、--verify及主要写入调用。历史fixed-generated检查不会自动检查workflow-rebuild，索引明确其限制。工具存在与实际addon/依赖可用不同，未验证本机完整重制环境。

本结论限只读索引、固定源/导出身份、命令声明及拒绝语义，不是重新制作、运行回读、动画、视觉或批量生产通过。原头发editable/生产GLB法线差仍保留。设备资源/当前equipment未提交改动未碰。

复跑：在完整检出运行 python -B scripts/production/qa-source-write-scope.py、python -B scripts/production/qa-flow.py、python -B scripts/production/qa-source-packages.py。稀疏审查树的第一条可加 --source-root F:/gamemake；后两条需要完整冻结资源。所有输出定向到新目录，不改旧报告。
