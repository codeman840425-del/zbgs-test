# 共用裤袜配方的整套准入

固定构建 `7809b98bd700` 的两套候选各包含上衣、裤子、鞋和袜子。[机器可读清单](readiness.json) 把身体、整套装备 SHA256、配方和完整角色记录关联到各自约 17.1 秒的 1x 房间影片及游戏关闭后的实际恢复。负例使用同一配方及同一资源集合，沿用了上一轮数字选择基线的完整记录，因此同时保留了两次不同的记录 SHA256。

两套仍属候选。静态 RGBA8 含 mip 估算中，女身体为 134,218,416 字节，男身体为 139,111,768 字节，均高于 100,663,296 字节上限。两件上衣各为 22,719,144 字节，高于 16,777,216 字节上限。整套适配、人类观感、普通电脑实测及该用途的分发授权仍待补齐。固定批次中，裤袜男女两条与尚无对应候选的原生男性一条均未正式准入。[静态估算](static-budget.json) · [正式计划](../release/plan.json)

## 复核已有证据

在仓库根目录运行 `python -B evidence/m2-shared-look-batch-v2/admission/review_existing.py`，从已保存的真实记录、报告和影片重算清单。要重算静态估算，使用干净的 `c99ad1db7a3ec2862bb6f0bd7a8e8134d3b609cc` 检出。以下示例为该检出预留独立目录。

```powershell
git worktree add --detach experiments/worktrees/m2-shared-look-c99-budget c99ad1db7a3ec2862bb6f0bd7a8e8134d3b609cc
npm --prefix experiments/worktrees/m2-shared-look-c99-budget/prototype ci
python -B scripts/production/record_budget.py measure evidence/m2-shared-look-batch-v2/records.json --source-root experiments/worktrees/m2-shared-look-c99-budget --budget-version m2-technical-v1
```

静态估算报告 `over-budget` 并返回退出码 `1`。普通电脑实测状态为 `unmeasured`。

## 正式准入入口

源内维护的 `scripts/production/outfit_admissions.json` 保存逐项审核收据的路径、字节数和 SHA256。批量请求和工作树参数无法添加准入项。固定构建的矩阵候选行有可核的参数配方 SHA256 时，维护者可通过独立收据准入该整套，保留原矩阵字节和构建身份。明确拒绝或静态预算超限的行继续拒绝。收据 `zbgs-whole-outfit-runtime-admission-v1` 绑定矩阵配方、适配与遮罩清单、身体、全部装备、完整角色记录及已复核的固定构建。`recipeSha256` 在款式绑定中表示矩阵配方，在角色记录校验中表示完整外观配方。

收据的 `lanes` 包含 `equipmentFit`、`normalSpeedMotion`、`recordAndRestore`、`selectionGuards`、`runtimeRecordAndBudget`、`humanVisualReview` 和 `provenanceAndRights` 七项。每项须有审核通过状态和内容固定的证据。动作项首个文件是房间报告，后附影片。恢复项前两个文件是游戏恢复报告和包清单。拒绝与恢复项首个文件是负例报告。预算项需要针对同一完整角色记录的四层预算准入报告。人工、授权和整套适配由维护者在加入收据前确认适用范围。当前索引为空。

当前编译矩阵有十条实际候选。以 `representative-batch-request.json` 的八条和 `shared-crew-socks-request.json` 中已经配置的两条复跑正式计划，共拒绝十条且未生成 D02 请求。裤袜诊断仍输出两条候选，送入 D02 的批次与旧诊断批次逐字节一致。用 `python -B scripts/production/test_variant_batch.py` 可复核整个 CLI 生命周期。测试在临时 Git 检出里使用合成收据与小型蒙皮夹具，实际 D02 批量解析器能读取正式请求，同时编译矩阵和 Git 提交身份保持相同。
