# 旧体和派生体双记录接收验证

固定源码为 `797516d2187abcc519edb850399f636b5d022cb4`，构建为 `9d520a80d731`。独立重建回执记录 515 个文件一致。正式游戏接收审查比对入口及可达的 11 个构建文件，并固定了对应的 review SHA。两份固定构建各自生成的 28 项清单逐字节一致，清单 SHA256 为 `29912fcb126ea17aec9b43f6f04e4e89700fab3038a92e04a972470293916f5c`。[独立重建](../rebuild-v2/report.json) · [独立清单](inventory-repeat.json)

用第二份固定构建导出的本地独立游戏包包含 **29 个文件，共 52,704,708 B**。逐件读回校验了字节数、SHA 与记录绑定。原记录 `2859d445…` 仍指向 `ab9af434…`，新记录 `bb85d456…` 指向 `cf1118a2…`。旧新目录分别保有各自适配身份。两个目录实际解析到同三条 GLB 路径，每份 GLB 只复制一次，较分别复制两套避免重复 3,738,740 B。[签名输入](inputs.json) · [包读回](package-readback.json)

## 复核命令

在仓库根执行。`inventory.json` 和 `inventory-repeat.json` 已保留，可用各自的 `--dist` 和独立检出 `--source-root` 向新文件复算清单。`game-package/record-consumer.html?records=/records/manifest.json` 是独立浏览器入口。本报告核验 CPU 包及依赖，静态预算和浏览器表现记录在相应报告。

```powershell
$fixed = 'experiments/worktrees/source-outfit-release-v2'
$repeat = 'experiments/worktrees/source-outfit-release-repeat-797516d2'
$evidence = 'evidence/m2-source-outfit-release-v1/receiver-v2'
node scripts/runtime-package/game-record-cli.mjs inventory --dist "$fixed/prototype/dist" --source-root $repeat --records "$evidence/inputs.json" --out "$evidence/inventory-fresh.json"
node scripts/runtime-package/game-record-cli.mjs export --dist "$repeat/prototype/dist" --source-root $repeat --records "$evidence/inputs.json" --inventory "$evidence/inventory-fresh.json" --out "$evidence/game-package-fresh"
python -B evidence/m2-source-outfit-release-v1/receiver/verify-package.py --inventory "$evidence/inventory.json" --inputs "$evidence/inputs.json" --package "$evidence/game-package"
```
