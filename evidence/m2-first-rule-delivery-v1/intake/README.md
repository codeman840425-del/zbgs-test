# 云岚的正式接收复跑

复跑使用融合方的云岚原签名、原装三件和私有游戏构建 `89bb64fabca4`。原始着装 VRM 为 `7aa4242c8575`，补全皮肤后的身体为 `bedc5970d9a2`，原签名为 `5a9741a2425c`。候选源码 `ef07d4e6` 的身体目录命中该模型，前次两次单人冷开均实际推进 121 帧。主工程的身体目录和两份工程的固定款式矩阵分别为 0 个匹配项。 [本次运行回执](yun-formal-replay.json)

| 入口 | 实际首败 |
| --- | --- |
| 主工程默认矩阵的正式整套计划 | 请求原装三件，产生 1 条 `No exact variant`、0 条准入、0 项创建。命令 exit 0 表示计划已生成。探测请求用原上衣装备 ID 和 `v1` 作为样式选择值，另独立核实该身体在整个矩阵确为 0 行。 |
| 融合候选的正式整套计划 | 运行时源码副本缺历史普通短裤和三组袜子的配方或 fit 文件，矩阵文件校验先失败，exit 1，计划目录未生成。 |
| 正式游戏清单 | 同一份记录从主工程和 `F:/` 分别执行，均 exit 1、`unsupported-build / No repository review for selected game runtime`，未创建清单。运行时评审先于逐记录读取。 |

20 人的原始 `.vroid` 和 `.vrm` 均在原目录重算摘要，与各自制作和接收回执一致。逐份 VRM 的内嵌授权字段与各自来源回执吻合。七人共 21 件精确装备均声明 `internal-study-only`，原体元数据为 `onlyAuthor`、`personalNonProfit`、要求署名、禁止再分发及修改。七份补全身体各有五类静态超限。其余十三人停在原生包唯一选件及同体覆盖归属，早于登记和游戏签发。历史正式发行 0/20，其中十三人未到单人发行请求。 [逐人原件、条款和装备回读](source-rights-and-stages.json) · [融合方逐人矩阵](../../../../gamemake-test/native-studio-round/independent/studio-20-admission/MATRIX.md)

要接通正式路径，制作端须给权利覆盖目标用途的确切身体和装备提供有效的固定矩阵条目，绑定参数配方、资源、fit、coverage 和记录摘要，并以同一构建补齐普通动作与接触、普通包冷开、拒绝后恢复、四层预算、人工观感及来源授权证据。两个正式评审入口尚缺相应索引。私有 `89bb64` 的候选复建已比对 11 件入口文件，旧构建的摘要还遗漏一份 Vite 导入配方，重新正式送审需固定此输入。 [整套评审核验](../../../scripts/production/outfit_admission.py) · [旧候选复核](../../m2-body-intake-v1/seven-receiver-observations.md)

使用工程内仍保留的单人请求和记录数组，可从 `F:/gamemake` 用新目的地执行。候选检出全程只读。

```powershell
$project = 'F:/gamemake'
$fusion = 'F:/gamemake-test/native-studio-round/registration/seven-fixed-89bb64fabca4/checkout'
$out = "$project/output/m2-first-rule-delivery-v1/intake"
$request = 'output/m2-first-rule-delivery-v1/intake/yun-outfit-request.json'
python -B "$project/scripts/production/variant_batch.py" $request --root $project --input-root $project --output "$out/yun-formal-plan-retry"
node "$project/scripts/runtime-package/game-record-cli.mjs" inventory --dist "$fusion/prototype/dist" --source-root $fusion --records "$out/yun-record-array.json" --out "$out/yun-public-inventory-retry.json"
```
