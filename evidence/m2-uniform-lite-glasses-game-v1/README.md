# 同一配方签出男女两位轻量制服角色

固定源码 `fdbe4548a370f96ada2400b339e68c7ed3b648da`，游戏构建 `60c87f62e8b0`。两个独立检出使用相同依赖锁和已安装的锁定依赖，各自构建得到 531 个相对路径和逐文件相同的字节。完整制作工作台和资源库有 742,834,531 字节。导出的独立游戏仅含这两名角色所需的 37 个文件和包清单，共 38 个文件。[构建核查](rebuild.json) · [独立包清单](inventory.json)

共享配方选用 1K 制服、原发和眼镜。生产端按每人的身体找到各自镜腿，签出两个不同角色 ID。两份记录均保存佩戴，麦克风均关闭。在同一批另加女性 bob，原发两人仍能试制，第三项因缺少适配而被拒绝。整套服装在正式批准表中仍为 0/2。[生产配方](../../assets-source/variant-matrix-v1/uniform-lite-glasses-request.json) · [试制](plan/plan.json) · [混合批次](mixed/plan.json) · [正式准入](formal/plan.json)

独立游戏冷开和关闭重开时，两副眼镜各有 7 个实际绘制的网格。女角色卸镜和重新装备时，男性角色及眼镜保留原实例。让男角色的镜腿首次返回 HTTP 503，男角色第二次加载成功，女角色只加载一次。女角色另在相同构建的房间走、坐、起、再走，四项任务均完成。[正常速度回放](index.html) · [双人结果](game/report.json) · [按人恢复](fit-failure/report.json) · [房间数据](room/report.json)

两人选中的资源闭包 41,127,656 字节，估算 52 个纹理对象和 209,367,384 字节 RGBA8 含 mip。与相同身体及衣服的无镜双人相比，多 72,553 字节和 4,416 三角形。本次房间录像在 RTX 4090、Chrome 157 下测得 rAF 间隔 p95 为 6.2 ms，最大 18.3 ms。普通电脑、实际显存、耳后承托及其他发型仍待验证。[成本计算与适用范围](budget/README.md)

## 从固定记录复建

从包含本回执的主工程运行以下 PowerShell。选择新的工程内输出目录。制作工具使用 Node 24 与锁定的 npm 依赖。安装依赖的机器需要能访问相应 npm 源。可直接打开同目录的 index.html 观看归档录像。

```powershell
$out = 'output/replay-lite-uniform-glasses'
$e = 'evidence/m2-uniform-lite-glasses-game-v1'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
$env:TEMP = (New-Item -ItemType Directory -Path "$out/tmp").FullName
$env:TMP = $env:TEMP
$env:npm_config_cache = (New-Item -ItemType Directory -Path "$out/npm-cache").FullName
python -B scripts/character-worktree.py create replay-lite-uniform fdbe4548 --runtime-only
$game = 'experiments/worktrees/replay-lite-uniform'
$dist = "$game/prototype/dist"
git -C $game sparse-checkout add scripts assets-source/garment-basecolor-release-v1 assets-source/m1b/shorts assets-source/m2-socks-layer-v1/generated assets-source/native-crew-template-v1/corrected
npm.cmd --prefix prototype ci
npm.cmd --prefix "$game/prototype" ci
npm.cmd --prefix "$game/prototype" run build
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/uniform-lite-top-matrix.json assets-source/variant-matrix-v1/uniform-lite-glasses-request.json --input-root . --root $game --diagnostic --output "$out/plan"
node scripts/character-production-cli.cjs --dist $dist --request "$out/plan/diagnostic-requests/create-001.batch.json" --out "$out/new-records.json" --evidence "$out/production"
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist $dist --records "$e/signed-pair.json" --inventory "$e/inventory.json" --out "$out/standalone"
$pin = '6ffea73b869384bd617be43e2b03f4704b9c6747e7b68fd97b323fae3a7560d8'
node scripts/qa-signed-live-equipment.cjs "$out/standalone" $pin "$e/signed-pair.json" "$out/cold"
node scripts/qa-signed-live-equipment.cjs "$out/standalone" $pin "$e/signed-pair.json" "$out/load-retry" --fit-failure
node scripts/run-fixed-check.cjs $dist scripts/qa-production-record-room.cjs "$e/room/input-record.json" "$out/room"
```

重新签发会记录新的制作时间。按归档签名导出可复建相同独立游戏包。固定工作台 4196 的发布身份单独管理。
