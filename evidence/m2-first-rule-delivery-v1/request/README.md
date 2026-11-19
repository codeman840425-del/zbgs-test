# 两具规则男体的原装选款与签发输入

两个接收回执分别绑定下颌权重 0.625 和 0.375 的模型。制作端读取登记身体、确切装备、适配和配方摘要，为同样三种款式各生成两行适配声明。两具身体使用同样的上衣、鞋和长裤文件，但装备实例 ID、绑定身体和角色 ID 各自独立。两份上衣的资源引用为 1K 版本。身体保留原皮肤，覆盖声明指向对应装备的 `preserveOriginalBody`。每个身体及每件装备通过单资源静态预算检查，合计成本和实际运行性能另有测量口径。 [六行款式矩阵](inputs/matrix.json) · [预算结果](inputs/budget.json)

实际运行 `variant_batch.py --diagnostic`，CPU 查询从共用生产 API 读到两个已登记身体，各自唯一的第 0 套制服被选出。两份 D02 请求包含身体摘要和每件装备的 ID、槽位、SHA-256。同一批次可交给固定游戏中的 D02。 [实际计划](technical-plan/plan.json) · [D02 批次请求](technical-plan/diagnostic-requests/create-001.batch.json)

同样输入以正式模式运行，两个角色都返回 `Whole-outfit runtime admission evidence is required from the reviewed index`，正式创建请求为零。本记录覆盖 CPU 请求生成和拒绝。签发、动作、冷开及正式证据由固定游戏回执判定。 [正式计划](formal-plan/plan.json)

盘根重放输入返回 `reused-identical`，在另一目的地重新规划产生的四个文件逐字节相同。交换两份配方及接收回执会在写入前拒绝。把第二具身体的上衣 ID 提交给第一具时，即使衣物文件摘要相同，第一具仍拒绝，第二具可生成请求。Windows 绝对盘根、相对回退和目录联接越界测试均通过。 [实跑回执](verification.json)

从 `F:/gamemake` 运行以下命令。前一条可复用已存在的同字节输入，两个计划目录须使用新路径。

```powershell
$base = 'output/m2-first-rule-delivery-v1/request'
$fit = 'evidence/m2-first-rule-delivery-v1/fit'
$recipes = 'assets-source/rule-body-recipe-v1'
python -B scripts/production/received_outfit_request.py --pair "$recipes/candidate.json" "$fit/candidate.json" --pair "$recipes/control.json" "$fit/control.json" --output "$base/batch"
python -B scripts/production/variant_batch.py "$base/batch/matrix.json" "$base/batch/request.json" --root . --output "$base/technical-retry" --diagnostic
python -B scripts/production/variant_batch.py "$base/batch/matrix.json" "$base/batch/request.json" --root . --output "$base/formal-retry"
python -B scripts/production/test_received_outfit_request.py -v
```

## 从参数配方和候选 VRM 导入

`--import` 接受成对的配方和 VRM，可重复指定。工具用现有接收器重做模型，逐项核对源模板、候选字节、原装三件和接收目标。在写登记前也会核对整批生成的零件适配、预算、输出目录和已存在的登记。成功后自动写入身体、装备登记和 `fits/`、`recipes/`、`matrix.json`、`request.json`。旧 `--pair` 接受已有 fit 回执，继续用于重跑选款输入。

实测从 `F:/` 启动，`--target-root` 指向工程内只有 `d5823781` 旧登记和三个共享服装文件的隔离数据目录。两个候选 VRM 从固定 `cb3aca0d` 检出只读输入。第二份 VRM 改一字节时隔离目录零变化。正确输入一次登记两个由内容摘要生成的身体，同一命令复跑逐字节一致。整个实测没有改写正常检出或固定构建。隔离目录上的正式计划仍为两条缺整套评审、零条正式创建。 [盘根实跑命令、输入摘要和正式回执](import-replay.json)

技术选款随后用 `cb3aca0d` 的运行源码和 CPU 依赖读取同一份自动生成的矩阵及请求。最小数据副本首次缺少帽子目录清单，加入固定源码直接引用的 JSON 后，两具身体均实际完成 CPU 查询，生成同原 D02 批次逐字节一致的技术请求。 [首次技术查询](import-technical-query.json) · [补齐源码依赖后重试](import-technical-retry.json)

以下命令可对保留的隔离目录复跑，它的已导入资产和申请会再次按正文和适配核对。

```powershell
$repo = 'F:/gamemake'
$target = 'output/m2-first-rule-delivery-v1/request/import-isolation-v1/runtime-data'
$fixed = "$repo/experiments/worktrees/rule-male-a-cb3aca0d/prototype/public/assets"
$recipes = 'assets-source/rule-body-recipe-v1'
python -B "$repo/scripts/production/received_outfit_request.py" --target-root $target --output request `
  --import "$recipes/candidate.json" "$fixed/rule-body-0beabf44f27c0618b0ff/body.vrm" `
  --import "$recipes/control.json" "$fixed/rule-body-c6ce7efc3da17fe50ea1/body.vrm"
```
