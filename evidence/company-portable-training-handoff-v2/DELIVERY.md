# ENV-007 单文件移交后的训练室净空

出租屋和二层公司的舞蹈训练室现在可以各自只交一份 `save.json`。接收者改名、重新封包、再编辑时，活动区及进门通路仍受原配方约束。默认普通公司的房间可正常编辑，一般培训课堂也可正常使用。内部独立接收回归已通过，外测方复验待回执。[版本与文件哈希](identity.json) · [两间训练室原速录像，27.76 秒](browser/video/named-training-rooms-normal.webm)

| 固定产物 | 核验结果 |
| --- | --- |
| 正式包 | `company-workspace/deliveries/named-training-v2` |
| 固定源码 | `af830afdf0898405b412c6a6de00fbc5f1d8dbf2` |
| 查看器 | `e5a77d978335`，接收副本按锁安装后重建，551 个运行文件逐一与正式查看器和清单比对相同 |
| 清单 SHA-256 | `bfef9d42d7b8621b18c36b0f7b59c53801651c39b9bf0572587edb23a1b2a6f5`，归位后实核 1,900 项，缺失、改动、多出均为 0 |
| 回滚包 | `company-workspace/deliveries/named-training-v1`，查看器 `2070c652571c`，清单 `0b2aa384cb0d998025dcf2488cac2eb37e0854e456aaf408f3c794d4c5d4c08e` |

工作副本沿用了按锁安装的依赖，将 8 个变化文件更新至最终清单并复核了全部文件。旧回归报告中的 `output/named-training/final-binding-package` 是同一正式包归位前的位置。[工作副本更新](receiver/locked-work-copy.json) · [运行文件重建](receiver/rebuild.json) · [归位核验](receiver/installed-verification.json)

## 缺陷与修复

v1 的编辑器能在原具名包中检查训练区，但一份已编辑的旧存档失去批次和编辑回执后，重新封包可能失去活动区规则。旧版复现接受了一盆 `plant-bonsai@1` 占用出租屋舞区，生成了修订 5。本次测试复用了同一摆放操作的字节，并分别验证了活动区和门口的实际网格阻挡。[旧工具成功回执](legacy/accepted-receipt.json) · [旧版错误接受的存档](legacy/accepted-intrusion.json) · [盆栽操作](legacy/bonsai-ops.json)

新存档的 `document.trainingBinding` 记录合同版本、公司、目标房间、净空规则、原批次输入或编辑回执的 UTF-8 原文及 SHA-256。恢复时核对声明、房间用途和来源。普通课堂按原始制房输入重建课堂及所属楼层，核验通过后保留一般课堂用途。同一公司的其他房间可以转作培训，舞区规则仍只作用于原舞室。旧存档仍有训练室但无法证明规则时返回 `training-origin-required`。在有房间来源的原包工作副本内，可用 `node edit.mjs apply OLD_SAVE OPS NEW_OUT --room KEY` 显式迁移。来源哈希验证内容一致性，核实发送方交付身份须使用独立取得的清单哈希。[合同检查](receiver/local-contract-checks.json) · [具名房编辑](receiver/named.json)

## 实测

- 两个舞室各完成三代编辑，分别产生修订 3、4、5。只留单文件、改名后重新封包、派生包再次编辑均保持原房间和来源 pin。原具名回归在初始与续编时共拒绝 8 次实物侵占。[具名回归](receiver/named.json)
- 便携回归执行 62 次命令。符合预期的拒绝包括 20 次净空受阻、8 次缺失来源、8 次绑定损坏、2 次选错原房和 2 次来源冲突。两份真实 v1 编辑存档各自通过显式原房恢复，两份派生包在测试结束后均通过净包复核。[便携回归与逐命令结果](receiver/portable.json) · [v1 编辑存档来源](legacy/report.json)
- 独立打包工具目录没有安装依赖，能输出帮助并优先拒绝越出项目的交付目录。实封时使用 `--source` 指向已安装依赖的另一个接收副本。该补充测试的打包器、编辑器和训练模块与正式包逐字节一致，其 1,892 项为该测试派生包的文件数。[净工具运行回执](receiver/clean-tool.json)
- Chromium 分别打开两间训练室、显示合法编辑、检查门口并在关闭重启后恢复。录像以原速录制，逐帧解码得到 1,600 × 1,000、25 fps、694 帧。六个拍摄状态都在视频中核到对应画面；活动区和门口的拒绝结果来自 CLI 实物检查。[浏览器报告](browser/report.json) · [录像逐帧复核](browser/video-review.json) · [出租屋换款](browser/rental-training-room-safe-edit.png) · [二层公司换款](browser/upper-floor-training-room-safe-edit.png)

## 复核命令

从公司项目根目录运行以下 PowerShell 命令。使用新的可写接收副本和输出目录。最后一个参数提供本次归档的两份原版编辑存档及原回执。

```powershell
$sealed = (Resolve-Path 'company-workspace/deliveries/named-training-v2').Path
$legacy = (Resolve-Path 'evidence/company-portable-training-handoff-v2/legacy').Path
$trial = 'output/named-training-replay-v2'
New-Item -Type Directory $trial -ErrorAction Stop | Out-Null
$work = Join-Path $trial 'working-copy'
node "$sealed/verify.mjs" $sealed bfef9d42d7b8621b18c36b0f7b59c53801651c39b9bf0572587edb23a1b2a6f5
Copy-Item -LiteralPath $sealed -Destination $work -Recurse
npm ci --prefix "$work/source/prototype"
node "$work/source/scripts/company-platform/test-named-training-handoff.mjs" $work "$trial/named"
node "$work/source/scripts/company-platform/test-portable-training-handoff.mjs" $sealed $work "$trial/portable" $legacy
```

在本项目安装了锁定 Playwright 和其 Chromium 的环境中，可沿用此前同一浏览器脚本和上一步的具名编辑结果复拍。脚本使用临时本机端口。

```powershell
node evidence/company-named-training-handoff-v1/browser/qa-named-training.cjs $work e5a77d978335 "$trial/named" "$trial/browser" --record
```

## ENV-007 外部独立复验

外测方使用旧版同一盆栽操作复现错误，再在 v2 检验改名移交、旧档显式恢复及同公司两套净空规则。宽窄边界分别拒绝和接受，活动区及入口的真实侵入均能定位。 融合测试登记为独立复验通过。外部报告 SHA256 为 `6f3b7229e6e848e173ff80fc1a9b5d52f7909167b6f9c133cadce8ba1473f376`。[融合测试原报告](../../../gamemake-test/native-studio-round/environment/portable-training-review/PORTABLE-TRAINING.md)
