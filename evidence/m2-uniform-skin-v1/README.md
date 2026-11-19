# 原肤与暖肤共用制服配方

游戏源码 `d96411ebef27a0e255bab3eaa49bf9addab48e8a`，构建 `d9cadedb54f6`。一份请求指定共同的身体、独立短发、金发与联动眉色、棕瞳、珊瑚唇和制服。两名角色各有稳定身份，其中一人只覆盖肤色字段。原构建拒绝未登记的暖肤，新构建在浏览器生成两份独立签名。实际导出的独立游戏包为 36 个文件。[同镜头照片与正常速度录像](index.html) · [批次输入](../../assets-source/variant-matrix-v1/uniform-lite-top-skin-request.json) · [旧版拒绝](before-plan/plan.json) · [新签记录](signed-pair.json)

在身体 `1049f87a` 上，脸部原图与遮罩可复用，身体原图按原导出规则在线性空间从 2K 缩至 1K。以 36 条对应边的中点抽样，暖肤变化的最大通道差为 0.001909。两套上衣各去掉 252 个被覆盖的身体三角形，交界线两侧的相邻三角形均保留。底图本身有明暗差，近景仍看得见下颌轮廓和颈部阴影。[制作端逐项复算与边界](source-fit.json)

浏览器核对了脸、身体的颜色因子和阴影因子，以及贴图内容、装备、可见三角形索引。把角色切回基础模式再穿回原套装，身体面数从 7480 恢复至 7732，再回到 7480。原肤与暖肤的近景、半身图有相同的相机、骨骼和模拟时刻。破坏记录签名后，当前暖肤保留。独立游戏关闭再打开，分别恢复两个身份与造型。暖肤角色在样板房间完成走、坐、起、离开，另以两间真实公司房间检验设施接线。[浏览器逐项记录](continuity/report.json) · [独立游戏](independent-game/report.json) · [样板房间任务及逐帧间隔](room-warm/report.json)

两人各估算 38 个纹理对象、138,063,528 字节含 mip。暖肤采用材质乘数，相对同款金发原肤增加 0 个纹理和 0 字节。两人同时加载的保守估算为 276,127,056 字节，超出 256 MiB 暂定参考 7,691,600 字节。两份角色共同依赖 21 个文件、27,896,903 字节。[逐角色成本](budget-signed-pair.json) · [双人并发预算结果](budget-concurrent-proof.json)

RTX 4090、Chrome 157、1440×1000，在关闭录制时对两个单人和一个双人组合各测了 12 秒。两名角色单独加载时渲染器均记录 41 个纹理，双人 81 个，销毁后均回到 1。三组帧间隔 p95 都为 6.2 ms，暖肤单人短测中有一帧 42.5 ms。实际显存及普通电脑表现仍待测。半身对照两侧在上衣腰腹部都可见细小青色斑点，来源待查。[开发机逐帧数据](development-budget/report.json)

## 复现

使用工程内独立检出和项目内临时目录构建 `d96411eb`，步骤见[前一固定版](../m2-motion-response-compat-v1/README.md)及[本版双检出复建回执](rebuild.json)。给第一份运行检出增加 `scripts` 与 `assets-source/garment-basecolor-release-v1` 两个稀疏目录。下列命令在主工程根目录运行，输出到新的工程内位置。

```powershell
$game = 'experiments/worktrees/warm-d96411eb'
$dist = "$game/prototype/dist"
$e = 'evidence/m2-uniform-skin-v1'
$out = 'output/replay-uniform-skin'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
python -B scripts/production/uniform_skin_surface.py --check
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/uniform-lite-top-matrix.json assets-source/variant-matrix-v1/uniform-lite-top-skin-request.json --input-root . --root $game --diagnostic --output "$out/plan"
node scripts/character-production-cli.cjs --dist $dist --request "$out/plan/diagnostic-requests/create-001.batch.json" --out "$out/signed.json" --evidence "$out/production"
node scripts/run-fixed-check.cjs $dist scripts/qa-record-skin-continuity.cjs d9cadedb54f6 "$out/signed.json" "$out/continuity"
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist $dist --records "$e/signed-pair.json" --inventory "$e/inventory.json" --out "$out/standalone"
node scripts/run-fixed-check.cjs "$out/standalone" scripts/qa-production-package.cjs "$out/reopened" "$e/signed-pair.json"
```

重新生产会记录新的制作时间。按已存签名逐字节复建独立包时，使用上面的归档记录和对应清单。
