# AB9A 原始男体与三件制服静态预算

固定源码 `31129ebfc9422793c118f5b2dd040b8b4e523e5e`，构建 `1eede692231c`，输入为 `../game-record.json` 的 `source-outfit-male-01`，记录 SHA256 `2859d4456cc702f69c4d35d98b840813860d7ba574fc3aad588462f64e619afa`。现有记录收集器核验入参后选出默认的上衣、长裤和平底鞋，再对固定检出与 `dist` 中的 12 项资源逐件核对 SHA 和字节数。

| 项目 | 文件字节 | 内嵌图片／纹理对象 | 内嵌图片编码字节 | RGBA8 全 mip 估算字节 | 单项预算 |
|---|---:|---:|---:|---:|---|
| 原始男体 | 17,914,788 | 25／25 | 14,396,843 | 139,112,108 | 顶点和纹理超限 |
| 独立上衣与领带 | 2,762,796 | 2／2 | 2,648,212 | 22,719,144 | 纹理超限 |
| 独立长裤 | 819,968 | 1／1 | 734,146 | 5,592,404 | 通过 |
| 独立平底鞋 | 155,976 | 1／1 | 114,662 | 1,398,100 | 通过 |
| 身体与三件装备合计 | 21,653,528 | 29／29 | 17,893,863 | 168,821,756 | 三项临时整套上限通过 |

装备目录另占 20,371 B。包括动作库、舞蹈、慢跑、按需打招呼和目录的资源闭包合计 **35,558,753 B**。包内 HTTP 压缩、首次网络实际下载和浏览器 GPU 分配在本轮范围外。模型数据无独立图片请求。

按 `m2-technical-v1`，原始体的 primitive 顶点数 90,958 超过 80,000，纹理全 mip 估算 139,112,108 B 超过 100,663,296 B。上衣加领带的纹理估算 22,719,144 B 超过 16,777,216 B。整套 21,653,528 B、29 个纹理对象、168,821,756 B 估算分别低于 67,108,864 B、96 个和 268,435,456 B 的临时上限。**完整记录的静态结论仍为 `over-budget`。** [完整预算](record-budget.json)

## 原装重复量

固定 `m1-equipment.js` 在装备提交后隐藏 VRM 内的原装网格。VRM 仍携带上衣、领带、长裤、鞋四个原始 primitive，共 4,260 三角和 51,120 B 索引元素。按 primitive 算法合计声明 31,288 个顶点，实际索引使用的顶点按 primitive 合计为 3,107。四个 primitive 的 POSITION 共用同一份 7,822 行 accessor，保留的身体 primitive 也引用它。

三件独立装备的四张 PNG 与 VRM 内图 17–20 的 SHA 逐一相等，共重复编码 **3,497,020 B**，独立纹理的全 mip 估算为 **29,709,648 B**。原装四张图在源 glTF、VRM0 材质和缩略图引用检查范围内仅用于上述四个 primitive。原装还引用图 1、2 和 10，这三张图另有引用。若只从身体的纹理估算扣除这四张图，仍有 109,402,460 B，仍高于身体上限 8,739,164 B。这是静态差额，未制作派生 VRM 或测其实际释放和分配。[各图片与原装引用](resource-overlap.json)

## 正式交付审查

技术审查登记前（操作端 cef5e28f 的父级状态），`game-record-cli.mjs inventory` 返回退出码 1、`unsupported-build` 和 `No repository review for selected game runtime`。未生成交付清单。资源收集只核对现有记录和资源闭包。[原始拒绝回执](release-inventory-attempt.json)。随后按两个固定检出复算并审查 11 个运行文件，实际导出双记录包、关闭重开并复核。复算命令在当前已登记版本会得到清单。单项模型预算沿用上表。[后续真实运行](../receiver/game/report.json)

## 复算

在项目根目录执行。`record_budget.py` 的退出码 1 对应这次静态超限，stdout 仍是完整报告。`measure-overlap.py` 读取同目录已存的两个原始报告，并重新逐件校验固定源码与 dist 中的资源。`game-record-array.json` 只将同一完整记录封装成正式 CLI 要求的有序数组。

```powershell
$fixed = 'experiments/worktrees/raw-male-source-outfit-v1'
$record = 'evidence/m2-raw-male-equipment-v1/game-record.json'
$budget = 'evidence/m2-raw-male-equipment-v1/budget'
node scripts/runtime-package/record-budget-input.mjs $fixed $record
python -B scripts/production/record_budget.py measure $record --source-root $fixed --budget-version m2-technical-v1
python -B "$budget/measure-overlap.py"
node scripts/runtime-package/game-record-cli.mjs inventory --records "$budget/game-record-array.json" --dist "$fixed/prototype/dist" --source-root $fixed --out "$budget/release-inventory-retry.json"
```
