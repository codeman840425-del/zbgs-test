# 实际换鞋、角色记录与重建

[打开原速对照](index.html)。角色、上衣、长裤、房间和路径相同，只有鞋改变。固定源码为 `57407c0e71ddf1964740b5ae39f4d6d9b146b47d`，构建为 `57621e5c967c`。两份独立检出的 662 个输入、534 个构建文件逐一相同。[复建结果](rebuild/comparison.json)

## 衣物生产与接地

可编辑来源是 CC0 原鞋和参数配方。制作脚本沿作者原有鞋底边界增加 20 毫米，保留原鞋面、鞋内脚姿、贴图和骨骼权重。左右鞋各有 18 条边连接新鞋墙，原鞋身 508 个三角形的位置未变。平底换为厚底增加 9,132 字节和 72 个三角形，整人仍有 25 个纹理对象，RGBA8 含 mip 估算 105,557,676 字节。[来源与生成](../../assets-source/sole-variant-v1/README.md) · [静态预算与依赖](asset/record-budget.json)

旧实现换装后继续使用隐藏鞋网格，[原始诊断](../m2-footwear-contact-intake-v1/README.md)同时记录了直接加载第二双鞋时的错误。现在装备变更在同一次提交内切换实际可见鞋和接触点，采样使用当前身体的参考姿势。只有配置多款鞋的身体额外保留动作校准数据，同一件已加载的鞋可回用结果。失败与取消均保留旧装备。[提交、回滚与缓存诊断](../m2-footwear-contact-intake-v1/transaction-after.json)

## 房间验证与限制

两款鞋各完成走停、入座、起身、再走和短舞。追加近景覆盖厚底入座、坐稳换回平底、起身。坐稳换鞋保持角色根位置，两脚底切换前后均距结构地面约 1.1 毫米以内。短舞出现的最大采样下沉约为平底 9.9 毫米、厚底 14.45 毫米。记录时钟、取样间隔、网格身份和各动作的最低点可在[房间报告](room-02/report.json)核对。第一次验收在录像前因矩阵 `-0` 与 JSON `0` 的表示差异停止，[原失败](room-01/report.json)已保留。第二次按角色签名使用的同一 JSON 比较规则，在原固定游戏中完成。

旧平底角色 revision 2 在房间加载。换鞋后生成了同一角色 revision 3，另开页恢复了两种装备。[修订后的角色记录](records.json) · [游戏包清单](inventory.json)。美术 Agent 的[独立款式片段](../../assets-source/sole-variant-v1/style-fragment.json)可按相同版本交给批次入口。当前候选仅有这一具男体的版型。同批请求中对应男体产生制作请求，女体因缺少对应版型被拒。[逐人结果](candidate-plan/plan.json)

导出的独立游戏共 27 个文件，包含包清单。从普通消费页首次打开，完全关闭 Chrome 后再打开，两次都从网络加载 165,108 字节的厚底 GLB。实绘网格的 680 个顶点与 612 个三角形和下载文件吻合。左右脚各取 15 个后跟点、35 个前掌点，均在可见鞋上，自然站立动作在两次冷开时分别推进 139 和 137 帧。[首开与全关重开](standalone/run-dsjZ9R/report.json)

固定游戏的制作端已经执行上述获选请求，签出新的独立角色 `sole-platform-male-sample`（revision 1）。与房间内既有角色 revision 3 比对，套装、装备资源和适配标识相同。未适配女体没有生成角色记录。[批次输出](produced-batch.json) · [实际签发回执](producer/report.json)

仅实测这一款平行厚底在该男体上的技术使用。舞蹈瞬时穿地、其他高度和高跟姿态、其他身体版型、普通电脑性能均保留独立结论。正式整套批准和人工观感分别记录。

融合测试另在 Chrome for Testing 145 对本构建和原签 revision 3 做了独立复验。同一个人物站立及坐稳时都能双向换鞋。四段共 766 个时点，非舞动作的平底和厚底鞋分别最多穿地 1.35 和 1.47 毫米，短舞分别为 9.53 和 14.49 毫米；四次浏览器生命周期结束后残留为零。本次范围为样板椅和这一具男体；公司设施交互及普通电脑实测另行验收。[独立回执](independent/review.json) · [来源与固定哈希](independent/sources.json)

## 重建

从包含此回执的主工程执行。新建目录均放在主工程内。生成工具所需源资产、依赖和版本列在[资产说明](../../assets-source/sole-variant-v1/README.md)。固定游戏依赖和 Windows 缓存设置沿用[固定构建步骤](../m2-uniform-lite-glasses-game-v1/README.md)。

```powershell
python -B scripts/production/sole_variant.py --publish --check
python -B scripts/character-worktree.py create replay-platform-shoes 57407c0e --runtime-only
$game = 'experiments/worktrees/replay-platform-shoes'
$e = 'evidence/m2-sole-variant-v1'
$out = (New-Item -ItemType Directory 'output/replay-platform-shoes').FullName
$env:TEMP = (New-Item -ItemType Directory "$out/temp").FullName
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:npm_config_cache = (New-Item -ItemType Directory "$out/npm-cache").FullName
git -C $game sparse-checkout add scripts assets-source/sole-variant-v1 assets-source/garment-basecolor-release-v1 assets-source/m1b/shorts assets-source/m2-socks-layer-v1/generated assets-source/native-crew-template-v1/corrected
npm.cmd --prefix "$game/prototype" ci
npm.cmd --prefix "$game/prototype" run build
$dist = "$game/prototype/dist"
python -X utf8 -B scripts/production/variant_batch.py assets-source/sole-variant-v1/style-fragment.json assets-source/sole-variant-v1/batch-request.json --input-root . --root $game --diagnostic --output "$out/plan"
node scripts/run-fixed-check.cjs $dist scripts/qa-footwear-room.cjs 57621e5c967cffd796b243b2ddd9b9da81d6a8bb819ced92528b4ba17bb81609 evidence/m2-cc0-body-release-game-v1/far-records.json "$out/room"
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist $dist --records "$e/records.json" --inventory "$e/inventory.json" --out "$out/game"
node scripts/run-fixed-check.cjs "$out/game" scripts/qa-footwear-cold-package.cjs 08c66c8953e33dfc1d5ee7d8dc459cbbf566d292a9d1ca66e2441d3fc304ce6e "$out/standalone-check"
```
