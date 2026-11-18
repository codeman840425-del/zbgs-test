# 原生上衣的批量接收与游戏回读

同一套工具接收云岚和 Bo Chen 各自的原生上衣。两份私有来源都包含该体的着装导出、原生编辑操作、去组后保存的可编辑文件及重新导出的 VRM。此前两个候选的单件上衣分别含 3,016 和 4,408 个三角形。

| 关口 | 本轮实测 |
| --- | --- |
| 作者来源 | 去组前后核对同一原件、精确组 ID、原生调用和保存后重开的文件。旧批次缺重开后的第二次组清单读取，保留标志 `coldGroupReadback=false`。新重放格式要求读取并比对。 |
| 打包与再接收 | 两人的其余 29,792／42,738 个三角形位置和 UV 保持。每人实际权重涉及 56 个身体关节；各从自己的去组原件恢复 1,020,687 个非全不透明像素。身体、上衣、短裤、鞋、装备 JSON 和遮罩 PNG 分别与原固定候选逐字节相同。新遮罩清单记录来源、组和精确图元。 |
| 错配 | 两例分别替换组、删除取证配方或修改图元，接收均拒绝。第 13 号输入另外使用 #02 的真实配方做错体验证，在写包前拒绝。 |
| 固定游戏 | 私有源码 `c63dca117f47`，构建 `50f24f49772f`。首次创建和独立冷开分别推进 58、56 帧，各取得 14 个不同角色资源，HTTP 均返回 200。新签两条 revision 1 记录，重开恢复原签名、身体、遮罩及三件装备。 |
| 更换生产目录 | 两个目录各自从原档重建。每具身体暂存八个文件，只将身体、三件装备、装备清单、遮罩及其清单七件安装到游戏中。两个制作目录的离线回执不同，647 个构建输入和 534 个成品文件一致。原先的暂存回执和覆盖登记会把本机路径带进游戏，导致换目录后构建摘要变化。 |

[打包逐项结果](paired-package-check.json) · [当前构建与角色回读](paired-fixed-game-current.json) · [旧版 907118 的固定结果](paired-fixed-game.json) · [旧签名在原构建的换衣对照](room.md)

另在独立接收目录运行正式登记命令。重复安装两人的同一输入后，14 个已安装资源、16 个暂存文件和两份目录清单的内容、大小、修改时间、文件 ID 均一致。Windows 在男性样件首次安装时拒绝目录改名，当次没有留下发布目录或成功回执。重新执行后成功。登记与归档现复用项目已有的短重试，只重试目录改名；持续占用仍返回原错误。[登记回执](registration-repeat.json)

本机可观看[当前构建双角色冷开后的正常速度短片](../../output/native-removal-fit-intake-v1/private-game-current-a/paired-preview/dressed-idle.webm)。画面是穿衣站立和现有讲话动作，1320 × 644，5.000 秒，已完整解码 150 帧。右侧白色高领遮住了部分下脸。本片用于查看记录恢复和着装，动作接触和服装审美仍单独验收。录像留在本机供内部观看。

## 如何重跑

在工程根目录执行。原生模型及原作者回执需本地具备相应使用权。Git 保存代码、输入摘要和汇总。以下实测来源在本机只读的融合归档内。制作端实测使用 Python 3.13.11、NumPy 2.4.2、Pillow 12.1.0，以及 `prototype/package-lock.json` 锁定的 Node 依赖。

```powershell
$archive = 'F:/gamemake-test/native-studio-round'
$out = 'output/native-removal-pair-replay'
python -B evidence/m2-native-top-removal-intake-v1/replay_inputs.py --archive $archive --output $out
python -B evidence/m2-native-top-removal-intake-v1/check_packages.py --female "$out/yun-package/import-batch.json" --male "$out/bo-chen-package/import-batch.json" --previous-assets "$archive/registration/seven-fixed-89bb64fabca4/checkout/prototype/dist/assets"
python -B evidence/m2-native-top-removal-intake-v1/replay_game.py --inputs $out --base 80fb16b7c6df3a7c85724c757969c6e3e6fb2b2c --output output/native-removal-pair-game
```

在另一个新目录重新生成输入与游戏时，给第二次 `replay_game.py` 增加 `--reference-dist output/native-removal-pair-game/source/prototype/dist`，检查逐文件差异。`--historical-layout` 配合 907118 原输入位置可复现旧版 536 个文件；当前构建采用包含七个角色运行文件的默认布局。

有原生作者操作档案的输入可从 `native_archive_package_inputs.py` 开始。提供原工程、原 VRM、原配方、冷开与操作回执的固定摘要，以及已接收原 VRM 的副本。该命令校验创建、参数修改、冷开回读和原导出，不会以再次执行编辑器的名义出具新回执。加上 `--fit <该体配方> --fit-sha256 <摘要>` 后得到可交给 `native_body_package.py` 的配置。其后沿用原有 `native_import.py`、`register_native_packages.py` 和游戏角色生产入口。私有素材应使用工程内的独立接收目录与本地固定候选。

新原生重放归档可用 `native_top_removal_fit.py <分组选择.json> --replay-run <归档> --request <固定请求.json> --request-sha256 <摘要> --original-calls <原导出回执索引.json> --output <工程内私有目录>` 合并作者组、图元与皮肤的核验结果。成功时可直接复用产出的 `fit-recipe.json`。

## 适用范围

此次新游戏记录覆盖两件单图元上衣的内部技术使用。关节核查覆盖参与身体蒙皮的实际加权索引。普通电脑表现、所有动作的观感、其他服装结构和正式发行仍需各自的证据。

第 13 号两片上衣可做离线提取。已复核原制作者的 33 份操作回执，缺少该体的去组导出。授权后执行工具拒绝启动本机 VRoid；进程和监听复核均为零。恢复所需原生请求已保存，当前没有该角色的去衣产物或游戏签名。[启动阻碍](native-launch.json) · [已验的双片提取范围](../m2-garment-group-input-v1/native-group-streams.json)
