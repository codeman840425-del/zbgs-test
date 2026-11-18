# ROLE-002 批产准入汇总

`native-production-readiness-v1` 的顶层 `status` 原来固定为 `adapter-work-required`，历史预算回归会校验这个值。`summary.runtimeReadyCount` 只统计 `runtimeCatalog`、`record`、`restore` 三项均 `verified` 的行。精确身体匹配的运行报告可验证这三项，旧 provenance 的 `runtimeAccepted` 和 `visualAccepted` 只能分别验证 catalog 和 restore。其余六项对应制作、冷开回读、导出、差分、身体包和覆盖，由既有 staging 校验标记。正式逐项准入要求九项都为 `verified` 且该行无待办适配任务。 [闸门阶段](F:/gamemake/scripts/production/native_batch_gate.py:180) · [历史预算检查](F:/gamemake/scripts/production/qa_native_budget_gate.py:81)

新字段 `aggregateOutcome` 的 `schema` 为 `native-production-readiness-aggregate-v1`，`scope` 为 `batch-runtime-admission`。它从既有 `acceptedForRuntime` 派生 `itemCount`、`acceptedCount`、`unacceptedCount` 和 `status`。全部准入为 `ready`，只有部分准入为 `partial`，零准入为 `blocked`。正式计划仍从 `acceptedForRuntime` 取 ID，并在实际生成请求前验证精确 `bodyType` 和身体 SHA。旧 cycle 只区分能否为至少一项开始正式规划，所以部分准入仍显示 `ready`。这个汇总只表述本批技术准入。 [记录计划](F:/gamemake/scripts/production/native_record_batch.py:99) · [周期输出](F:/gamemake/scripts/production/native_admission_cycle.py:92)

仅当不同准入项指向同一个 `bodyType` 时，新闸门沿用既有记录计划的重复身份错误并提前终止。未准入的重复适配候选仍可作为诊断。同一身体生成多个签名角色属于后续记录流程。重复条目 ID、重复 runtime report body type、损坏的必需包数据继续作为输入错误处理，不生成新的有效报告。 [重复和坏包回归](F:/gamemake/scripts/production/test_native_batch_gate.py:81)

## 实测

| 通过实际 gate 和 cycle 的输入 | `runtimeReadyCount` | `acceptedCount` | 新汇总 | 旧 cycle |
|---|---:|---:|---|---|
| 两项完成全部阶段 | 2 | 2 | `ready` | `ready` |
| 两项已有运行回读，其中一项留有适配任务 | 2 | 1 | `partial` | `ready` |
| 两项适配检查齐全，其中一项缺运行回读 | 1 | 1 | `partial` | `ready` |
| 两项均已有运行回读，均仍有适配任务 | 2 | 0 | `blocked` | `blocked` |
| 两项均缺运行和适配准入 | 0 | 0 | `blocked` | `blocked` |

测试使用两个实际 staged package 和已存的双体运行报告。用于验证正分支的完整适配报告是临时测试夹具。用历史 v21 的精确参数在内存复算后，除 `aggregateOutcome` 外所有字段都与原报告相同。实际仍为 `runtimeReadyCount=2`、8 项待适配、`acceptedForRuntime=[]`，本次汇总为 `blocked`。40 项 gate、cycle、planner 定向回归通过。 [回归入口](F:/gamemake/scripts/production/test_native_batch_gate.py:43) · [历史 v21](F:/gamemake/evidence/m2-native-admission-cycle-v21/gate.json)

```powershell
python -B -X utf8 -m unittest discover -s scripts/production -p test_native_batch_gate.py
python -B -X utf8 -m unittest discover -s scripts/production -p test_native_admission_cycle.py
python -B -X utf8 -m unittest discover -s scripts/production -p test_native_record_batch.py
```
