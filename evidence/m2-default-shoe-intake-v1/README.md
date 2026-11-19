# 从上衣和鞋款生成角色

[观看 17 秒原速房间录像](room/room-produced-1x.webm)。男角色在房间中行走、入座、起身并离开。这一轮验收的是制作端能否选对装备，以及游戏重开后能否保留同一选择。

美术输入只提供两项款式和版本，各人的身体与稳定身份另存。制作端从固定游戏自己的目录读取资源。在审查模式下，1K 制服男体唯一匹配上衣、长裤和 20 毫米平行厚底鞋。女体缺少这个鞋款的版型，单独返回原因。若只指定上衣，男体有两套符合条件的造型，制作端会列出可选项；明确选择平底后，男女都取回了各自原来的鞋。[原始配方](../../assets-source/sole-variant-v1/uniform-style-pair-request.json) · [逐人选择](technical/plan.json) · [歧义与消歧](ambiguity/report.json)

固定源码 `eddeb995`，构建 `32d1c2865f09`。两个独立检出的 534 个构建文件逐件一致。浏览器签出的单人记录为 revision 1；其身份、外观、装备材质、附件和资源清单与先前显式指定穿搭的输入结果相同。房间动作全部完成，关闭页面再加载后核对外观。独立游戏导出共 27 个文件。两个各自启动和关闭的 Chrome 进程都从该包读取同一条记录，从下载的鞋和实绘的鞋分别核对几何及四个鞋底接触区。[复建](rebuild/comparison.json) · [签发的记录](signed.json) · [房间回读](room/report.json) · [游戏冷开](game/run-jjfVP9/report.json)

RTX 4090、Chrome 157 的原速录制取得 2,813 个浏览器帧间隔，P95 为 6.4 毫秒，最长 18.2 毫秒。采样只覆盖这台机器和这段动作。早先测得该厚底鞋在短舞中瞬间穿地 14.45 毫米；本次未重测舞蹈。普通电脑实测和完整穿搭的正式审核仍待完成。正式生产命令对本批两项均予以拒绝。[逐帧数据](room/report.json) · [正式生产回执](formal/plan.json)

## 重放

在角色主工程运行。按[固定检出和依赖步骤](../m2-sole-variant-v1/README.md)建立源码 `eddeb995` 的游戏检出并构建，将其路径赋给 `$game`。以下命令使用全新的工程内输出目录。最后一条会在临时本地服务中创建角色记录，关闭浏览器后服务随之退出。

```powershell
$out = (New-Item -ItemType Directory 'output/replay-style-pair').FullName
$recipe = 'assets-source/sole-variant-v1/uniform-style-pair-request.json'
python -X utf8 -B scripts/production/variant_batch.py $recipe --root $game --input-root . --output "$out/formal"
python -X utf8 -B scripts/production/variant_batch.py $recipe --root $game --input-root . --diagnostic --output "$out/fit"
node scripts/character-production-cli.cjs --dist "$game/prototype/dist" --request "$out/fit/diagnostic-requests/create-001.batch.json" --out "$out/signed.json" --evidence "$out/producer"
```
