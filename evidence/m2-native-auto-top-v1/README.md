# 两件原生上衣的自动识别与游戏回读

在同一套制作命令里分别投入云岚和 Bo Chen 的原生着装导出、本人去上衣导出与可核实的制作记录。工具分别找出 3,016 和 4,408 个被去掉的三角形，校验每人的 13 个保留表面及蒙皮。每人 7 个游戏资源与历史固定版本相同。制作源码 `454501c3`，游戏构建 `50f24f49772f`，两个 dist 的 534 个文件字节完全一致。[输入及计算](receipt.json) · [浏览器与成品](game.json)

本机可以观看[双角色原签名冷开后 5 秒的正常速度录像](../../output/m2-native-auto-top-game-r02/restored-current/two-characters-1x.webm)。已解码全部 150 帧，1320 × 644。两人均穿着本人上衣、短裤和鞋。右侧白色高领遮住一部分下脸。本片覆盖穿衣站立和现有手势；走动碰撞、正式服装观感、普通电脑表现仍待分别验收。原模型、操作归档和录像保存在许可允许的本机位置。

在固定制作源码上，为每个输入各计算两次，随后用普通游戏加载器实测三次：新签两人、独立冷开新签、另一次浏览器冷开历史两条原签名；每次实际读到 14 个角色资源。把别人的去衣模型换入或移除保存调用都被拒。第一次跨版本复算发现保留骨架矩阵的计算方法不同，登记拒绝，重新使用同一制作源码备料、登记后成功。[失败及恢复](failures.json) · [变更蒙皮的独立检查](../m2-garment-skin-differential-v1/README.md)

两例均只有一个被去掉的上衣图元，历史归档缺少冷开后的第二份组清单。另有 13 人的 26 份原件已核 SHA，均缺本人的可用去组导出，未取得修改和再分发许可。当前 20 人的正式发行准入为 0。[13 人来源审查](../m2-garment-intake-followup-v1/intake.json)

## 重跑

使用[原生接收说明](../m2-native-top-removal-intake-v1/README.md)里的私有输入、锁定依赖和逐角色游戏命令。在制作步骤追加 `--discover-top`，使用工程内新的输出目录。可独立运行本目录的 `verify.py --help` 查看复核所需目录和原签名。

```powershell
python -B evidence/m2-native-top-removal-intake-v1/replay_inputs.py --archive F:/gamemake-test/native-studio-round --output output/auto-top-replay-input --discover-top
python -B evidence/m2-native-top-removal-intake-v1/replay_game.py --inputs output/auto-top-replay-input --base 80fb16b7c6df3a7c85724c757969c6e3e6fb2b2c --reference-dist output/native-removal-fit-intake-v1/private-game-current-a/source/prototype/dist --output output/auto-top-replay-game
```
