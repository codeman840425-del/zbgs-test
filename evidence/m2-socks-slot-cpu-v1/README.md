# Socks 槽位合同 CPU 检查

本包从e25e211隔离工作树实施，仅修改共享equipment-set解析器及新增检查脚本。socks作为独立槽位，仍走现有prepare/commit可见性入口。

选择socks时，条目必须声明 `pairedWith: {shoes: [{id, sha256}], lower: [{id, sha256}]}`。两个列表都必须存在，shoes非空，每个列表的ID唯一，配对只包含id和64位小写十六进制sha256。最终选择中必须有精确配对的鞋，每个实际选中的bottom、bottoms-overlay、onePiece也逐项匹配。lower可空，此时只允许最终集合没有下层条目。未选择socks的造型继续沿原解析行为。

本报告验证52项，其中现有五个profile和全部既有造型直接读取真实清单。额外使用制作方085f4e6工作树中的男女generated entry，实际通过女pants、男pants/shorts三套元数据配对。其他袜/overlay样件用于合同阴阳例。检查包含错误身体、未知配对ID、错误SHA、重复袜槽、缺鞋、缺规则、坏规则、重复配对ID、全套prepare/commit及错误时原可见性保留。

`contract.json`记录解析器SHA、输入清单SHA、作者entry JSON/资产声明SHA和逐项结果。`existing-loader/report.json`是既有qa-equipment-set.mjs的实际原男GLB/骨架绑定及异步取消、部分失败保原、重试四组回归，纹理解码使用原脚本CPU夹具。

命令可从工作树根目录执行，第三参数指定制作方仓库时会增加三套真实作者元数据检查。

```powershell
node scripts/qa-socks-equipment-set.mjs evidence/m2-socks-slot-cpu-v1 F:/gamemake-selected-budget
node scripts/qa-equipment-set.mjs F:/gamemake-socks-slot/evidence/m2-socks-slot-cpu-v1/existing-loader
```

本包完成组合准入与提交入口验证。袜GLB制作/适配、实际纹理、穿鞋和裤层覆盖、动作、关闭恢复及浏览器视觉验证由总工在合入资源后的固定候选继续完成。
