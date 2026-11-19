# 正式整套准入拒绝复跑

以固定游戏 `9ce414f65f55` 的原签名、库存、走坐、两次冷开和选择保护回执为控制组。原记录先通过 `verify_room_report`、`verify_runtime_readback` 和 `verify_guard_report`。三个分支仍独立拒绝，复跑产生零份发行产物。原签名、库存、回执和正式评审索引的字节保持相同。 [机器回执](rejection-replay.json)

| 拒绝分支 | 使用的真实输入和实际结果 |
| --- | --- |
| 必要证据缺失 | 从隔离副本移除 `recordAndRestore` 的冷开报告，保留真实报告摘要。同一正式资料校验函数 `pinned_file` 拒绝缺失文件。原冷开报告仍可重新通过验证。 |
| 装备身份不匹配 | 只把原 1K 制服上衣换成实际存在且摘要不同的原版上衣，沿用原真实包回读和保护报告。前者返回 `Game package does not pin the complete reviewed outfit`，后者返回 `Guard proof belongs to a different outfit or dependency set`。同一变化直接提交普通游戏导出时，也由签名包络拒绝为 `recipe-hash-mismatch`，目的地未创建。 |
| 整套未审核 | 正式 planner 使用仓库现有审核索引，两条原样请求均返回 `Whole-outfit runtime admission evidence is required from the reviewed index`。仅出具诊断 `plan.json`，创建请求为零。 |

正式索引为空时，完整流程首先停在第三行。前两行直接调用现有正式验证器，分别使用缺项与确切资源变化触发原有检查。测试未构造或登记任何准入。

对固定数据包运行时 `60e3934ddd8a`，新角色只换上衣后用原真实库存和数据包实际请求导出，同样返回 `recipe-hash-mismatch`，原记录与库存仍可逐字节核对。该包还包含上一版同一条签名，实测提交 `9ce414f65f55` 的真实冷开报告会在构建身份处拒绝。 [跨构建与导出回执](current-runtime-rejection.json) · [普通包冷开报告](../cold/report.json)

新版补齐了标准格式的冷开和选择保护报告。当前包的两条签名在负控前后都通过 `verify_runtime_readback` 和 `verify_guard_report`。隔离移除新冷开报告时，`pinned_file` 拒绝缺项。只替换新角色的上衣并沿用两份原报告时，冷开验证和保护验证都以装备身份不匹配拒绝。零发行产物，原签名、真实库存、两份报告和正式索引摘要均保持一致。完整正式准入仍待独立审批和其余必需证据。 [新版两条签名和负控](standard-restore-guards-replay.json) · [标准冷开报告](../restore/report.json) · [九项选择保护](../guards/report.json)

## 复跑

在项目根运行专项 CPU 测试。传入 `--records`、`--inventory`、`--room`、`--restore`、`--guards` 可指定同一固定版的真实数据。`--matrix`、`--request` 和 `--planner-root` 选择对应的未审核计划。`--dist`、`--runtime-root` 与可重复的 `--shape-pack` 启用实际导出的包络拒绝测试。

```powershell
$fixed= 'experiments/worktrees/rule-male-a-cb3aca0d'
python -B scripts/production/test_real_outfit_evidence.py --runtime-root $fixed --dist "$fixed/prototype/dist"
```

新版可用 `--restore-only` 复跑两条签名的标准冷开、选择保护和前述负控。

```powershell
$archive = 'evidence/m2-frozen-rule-game-v1'
python -B scripts/production/test_real_outfit_evidence.py --restore-only --records "$archive/records.json" `
  --inventory output/m2-frozen-rule-game-v1/inventory.json --restore "$archive/restore/report.json" `
  --guards "$archive/guards/report.json"
```

使用 `--previous-restore` 可单独复跑跨构建身份和改件导出拒绝。

```powershell
$fixed = 'experiments/worktrees/shape-ext-a-6e858e51'
$archive = 'evidence/m2-frozen-rule-game-v1'
$artifacts = 'output/m2-frozen-rule-game-v1'
python -B scripts/production/test_real_outfit_evidence.py --records "$archive/records.json" `
  --inventory "$artifacts/inventory.json" --restore "$archive/cold/report.json" `
  --previous-restore evidence/m2-first-rule-delivery-v1/restore/report.json `
  --runtime-root $fixed --dist "$fixed/prototype/dist" --shape-pack "$artifacts/pack"
```

两项历史 CPU 探针也已归档。首项复现编译目录对占位身体的拒绝，第二项对两份已知数据包逐项核对真实 HTTP 交付的文件长度和摘要。可复跑命令、源码摘要和结果均使用项目内路径，无需历史临时端口或本机私有配置。 [归档命令和回执](runtime-probes.json) · [目录探针](frozen-runtime-boundary-probe.mjs) · [HTTP 探针](d02-shape-http-probe.cjs)
