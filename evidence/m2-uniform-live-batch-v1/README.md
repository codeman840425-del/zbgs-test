# 一份制服配方，两种直播装备选择

游戏源码 `1239c0e2a7c2ecaa226fdb8a40bd4e12f710b068`，构建 `73d6f64eeebc`。两份独立检出的 654 个源码输入和 529 个构建文件逐字节一致。工作台导入的代表批次 JSON 现已纳入构建标识，本次 Agent 提交的主持人与嘉宾配方是外部制作输入。[观看 1 倍速](index.html) · [固定构建](rebuild.json) · [制作配方](../../assets-source/variant-matrix-v1/uniform-live-pair-request.json)

| 签名角色 | 实际基模 | 眼镜 | 麦克风 | 游戏验证 |
| --- | --- | --- | --- | --- |
| 制服主持人 | 原女性 027bed60 | 女性镜腿 | 女性握姿和讲话位置 | 讲话、卸下与装回、单人走坐起、重开 |
| 制服嘉宾 | 原男性 62b44b03 | 男性镜腿 | 配方覆盖为关闭 | 讲话、保持原实例、镜腿加载失败后独立重试、重开 |

以前的规划器对同一输入返回 `Invalid sharedLook`。现在每个身体分别核对道具文件、镜腿或握姿，在游戏中生成两个独立签名。关闭再打开时两副镜架各有 7 个网格绘制，主持人的麦克风有 9 个。专门让嘉宾的镜腿文件返回一次 HTTP 503 后，页面显示受影响角色和原因。点击重试只重新装载嘉宾，主持人保留原实例与道具。单人样板房的录像另复查了走到椅前、坐下、起身和离开。远景录像不足以评定手指和耳后细节。[旧版拒绝](before.json) · [批次结果](plan/plan.json) · [签名](signed-pair.json) · [两轮冷开](game/report.json) · [实际失败与恢复](fit-failure/report.json) · [房间任务和帧间隔](room-host/report.json)

原版双人的选中资源依赖共 73,590,958 字节，纹理保守估算为 327,157,076 字节（RGBA8 含 mip）。两项均超暂定双人预算。Chrome 157、RTX 4090 的单人房间录制测到 2,818 个 rAF 间隔，p95 为 6.2 ms、最大 30.3 ms。普通电脑与实际显存仍待测。两件眼镜的适配仍处于候选状态。正式模式本次签发 0 份。在轻量体混合请求中，需眼镜的女性缺精确适配被拒；明确关闭道具的男性仍单独得到试制请求。[预算](budget.json) · [正式模式](formal/plan.json) · [轻量体逐人处理](mixed-1k/plan.json)

## 从新检出复建

从含本回执的工程运行下面的 PowerShell。已验证的工具为 Node 24.13.0、npm 11.6.2，依赖锁摘要见构建回执。使用新的工程内目录，已有固定检出和已核定 dist 时可直接从配方步骤开始。浏览器 QA 使用该工具检出的 `prototype/node_modules` 与已安装的 Chrome。

```powershell
$out = 'output/replay-uniform-live-pair'
$e = 'evidence/m2-uniform-live-batch-v1'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
$env:TEMP = (New-Item -ItemType Directory -Path "$out/tmp").FullName
$env:TMP = $env:TEMP
$env:npm_config_cache = (New-Item -ItemType Directory -Path "$out/npm-cache").FullName
python -B scripts/character-worktree.py create replay-uniform-live 1239c0e2 --runtime-only
$game = 'experiments/worktrees/replay-uniform-live'
$dist = "$game/prototype/dist"
git -C $game sparse-checkout add scripts assets-source/garment-basecolor-release-v1 assets-source/m1b/shorts assets-source/m2-socks-layer-v1/generated assets-source/native-crew-template-v1/corrected
npm --prefix prototype ci
npm --prefix "$game/prototype" ci
npm --prefix "$game/prototype" run build
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/representative-matrix.json assets-source/variant-matrix-v1/uniform-live-pair-request.json --input-root . --root $game --diagnostic --output "$out/plan"
node scripts/character-production-cli.cjs --dist $dist --request "$out/plan/diagnostic-requests/create-001.batch.json" --out "$out/new-records.json" --evidence "$out/production"
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist $dist --records "$e/signed-pair.json" --inventory "$e/inventory.json" --out "$out/standalone"
$pin = '53b6e3f9f8e68ac645e8261c0d3e25aa45bbda341d8683536ec6624e36bbe5ec'
node scripts/qa-signed-live-equipment.cjs "$out/standalone" $pin "$e/signed-pair.json" "$out/cold"
node scripts/qa-signed-live-equipment.cjs "$out/standalone" $pin "$e/signed-pair.json" "$out/failed-fit" --fit-failure
node scripts/run-fixed-check.cjs $dist scripts/qa-production-record-room.cjs "$e/room-host/input-record.json" "$out/room"
```

重新签发会记录新的制作时间。上例用归档的原签名和对应清单复建 51 文件独立游戏包。整包面向技术验证，正式游戏侧接收单和 4196 预览各自单独发布。[包内文件清单](inventory.json)
