# 5859 已签女性 bob 的静态预算

`record_budget.py measure` 自动识别并核对普通女体、刚性 bob 精确资源、发色与脸部配色实现、依赖锁和原始材质图。该资源族内不同角色 ID 和已登记色值可复用同一冷载算法。未知家族、文件路径、材质、编码、分辨率、采样或实现被拒绝。普通报告只有实际使用该模型时新增 `accountingMode`。 [预算实现](F:/gamemake/scripts/production/record_budget.py:272)

| 已签记录 `6ec80b23…` | 新纹理对象 | 尺寸 | Canvas 像素等价 | 另存 `ImageData` 与原像素数组 |
|---|---:|---|---:|---:|
| 发 | 2 | 1024 × 1024 | 8 MiB | 0 |
| 眉 | 2 | 1024 × 256 | 2 MiB | 0 |
| 虹膜 | 2 | 1024 × 512 | 4 MiB | 8 MiB |
| 唇 | 2 | 1024 × 1024 | 8 MiB | 16 MiB |

每类的 base map 和 shade map 是两个对象，共享原 PNG。两个新对象各有独立的 Canvas 与 Source。替换短发和隐藏原发在同一角色内复用同一对，脸部描边也复用本脸的那一对。暖肤色改材质因子，新增纹理为零。冷载派生合计为 8 个对象、22 MiB 无 mip 的 RGBA8 逻辑等价。CPU 侧可计持久像素载荷为同一批 22 MiB Canvas 加 24 MiB 像素数组，共 46 MiB。发色转换另经手合计 10 MiB 临时 `ImageData` 像素分配，这些顺序操作的同时驻留峰值未测量。眼唇遮罩和虹膜底图计入传输，其分析临时数据、浏览器实际堆和 GPU 字节另待测量。 [发色实现](F:/gamemake/prototype/src/character-appearance.js:89) · [旧脸部色板实现](F:/gamemake/prototype/src/facial-palette.js:85)

独立角色各持派生缓存，传输闭包只按路径计一次。复色和移除验证只关联 exact `6ec80b23…`、固定构建 5859 及已有 Chrome 回执，通用预算输出保留 `runtimeReconciliation=not-linked`。两条签线的整套静态结果仍超预算，分别因为基础体类 `rgba8MipBytes` 超限。 [默认测量](default-measure.json) · [同身份交叉核验](../matched.json) · [旧 operator 拒绝实证](../../m2-uniform-agent-handoff-v1/signed-record-budget.json)

```powershell
python -B -X utf8 scripts/production/record_budget.py measure evidence/m2-uniform-agent-handoff-v1/records.json --source-root experiments/worktrees/garment-80fb16b7 --budget-version m2-technical-v1
python -B -X utf8 scripts/production/record_budget_test.py experiments/worktrees/runtime-receiver-cfca0dd1
```

15 项回归通过，从 `cfca0dd1` 读取旧原生覆盖输入，从 `80fb16b7` 读取本项 5859 用例。主检出的 `m1-equipment.js` 字节曾触发旧原生覆盖模型的版本拒绝，该拒绝在改动前复跑也存在。测试的旧肤色用例改用实际传入的固定源码路径。 [独立回归](F:/gamemake/scripts/production/record_budget_test.py:23)
