# 相同输入/配置归档复跑

原 `m1-native-hem-shell-review` 全部文件保持未改；本次不制作第二方案。原生Blender4.5.9、相同0.8mm/Even/HighQualityNormals/Simple参数从冻结inputs直接执行，不读活动worktree。

```powershell
python scripts/diagnose-native-hem-shell.py --archive experiments/m1-native-hem-shell-review --verify-inputs-only
python scripts/diagnose-native-hem-shell.py --archive experiments/m1-native-hem-shell-review --output experiments/m1-native-hem-shell-new-output --blender F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe
```

恢复依赖为本仓诊断脚本、完整冻结archive（尤其manifest+inputs）、Blender4.5.9 Windows发行版及其内置numpy。外部Python仅stdlib作启动器。新检出若未归档ignored experiments，必须恢复该冻结目录；不假定活跃worktree或旧临时capture存在。`--output`必须未存在，归档8个输入先核原bytes SHA。源029再核精确SHA，mapping/capture来源绑定仍核验。Blender版本不符拒绝。

本次2线程复跑已完成，3份完整生成数组gzip逐byte一致（含位置、三角、polygon、对应、所有contact对），见recovery-equivalence.json；frame18同样13对身体交叉，保持失败结论。blend保存信息/运行时间不要求字节一致。没有cloth、厚度扫描或新形状制作。
