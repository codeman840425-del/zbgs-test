# 两名制服角色在实际公司房间换座

[观看正常速度前后对照与两间房全景](index.html)。旧版的家具出口距接近点只有 5 厘米。角色按照家具给出的路线离开椅面后，停在下一人的进路上。新版继续经过该出口，在同房内找到能让同伴到达椅前的位置。当前人走到那里且臀部离开座面后才释放占用。给接替者规划路线时按实际同伴位置、胸肩范围及家具阻挡检查通行。进路被完全挡住时返回失败，移开阻挡后可重新请求。

Chrome 157.0.8103.79 在开发机的两间房内完成入座、争用拒绝、离座、接近中取消、再次入座及保存后独立重开。民房侧面正常速度记录 26.28 秒。两人都站立并发生交接时，骨盆中心最近距离由 0.01120 米增至 0.56173 米，肩部中心由 0.03708 米增至 0.57474 米。新片后段前景人物部分挡住椅子，坐稳时两人骨盆中心距离仍至少 0.66223 米。[逐请求结果](gameplay/report.json) · [同镜头逐帧测量](controls/visual-review.json)

另外在 60 Hz CPU 动作回放中，两间房的胸骨中心最小水平距离分别为 0.578 米、0.658 米。此项和浏览器的骨盆测量使用不同关节。适用范围是这两份签名记录、这两个房间及工位椅，逐个衣料三角形、复杂多人避让、普通电脑性能与最终人工观感仍待验证。[实际模型回归](cpu-tests.tap)

## 重新生成游戏交付

从[双检出步骤](rebuild.json)构建角色源码 `989deed323a781010931518650cd26256d3c3a02`。工具检出应包含本构建在 `game-runtime-reviews.json` 的登记。以下命令在主工程根执行，输出至一个新的工程内目录。公司输入须对应 SHA-256 为 `6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2` 的交付清单。

```powershell
$game = 'experiments/worktrees/seat-clear-989deed3'
$records = 'evidence/m2-uniform-lite-operator-v1/records.json'
$company = 'F:/gamemake-test/native-studio-round/official-pair/body-texture-f496/received-room'
$out = 'output/replay-seat-clearance'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist "$game/prototype/dist" --records $records --inventory evidence/m2-company-seat-clearance-v1/inventory.json --out "$out/pair"
node scripts/production/package-facility-room.mjs --game "$out/pair" --game-sha256 1759505cc6ef16f93a16508ba795ac52c060e137306f0742d4950423d71f8406 --room $company --out "$out/rooms"
node scripts/run-fixed-check.cjs "$out/rooms" scripts/qa-game-facility-room.cjs d9140194fb84 $records "$out/gameplay"
node scripts/qa-game-facility-controls.cjs "$out/rooms" 1c86367d0ac35a67957138b2db11ed0f1a1fd12c124792c72d5a9db56f9eedf8 "$out/controls"
```

实际运行入口为组合包的 `facility-room.html?room=plant-home` 或 `facility-room.html?room=plant-rental`。测试脚本临时提供本机 HTTP 服务并在检查结束时关闭。4196 与 60800 继续分别供人物与环境人工预览。
