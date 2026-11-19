# 在两个独立主播记录上复用一具身体和一套制服

[同镜头脸部近景、独立游戏与房间录像](index.html)。固定游戏源码 `ba9a95f6`，构建 `f7ea73f3ec73`。制作请求共享女体与制服款式，各自提供角色身份，其中一位选用金色短发与联动眉色、棕色虹膜和珊瑚唇，另一位保留原发原色。两份造型都保留原肤色。[美术参数请求](../../assets-source/variant-matrix-v1/uniform-lite-top-head-request.json) · [新签记录](signed-pair.json)

旧构建会接收原色记录、逐项拒绝缺少头部登记的选择。对照实际身体数据，头骨挂接、原发 225 个顶点和 394 个三角面、脸部 56 个形态及所选配色的纹理、UV 与遮罩可以复用。现有短发模型和遮罩直接沿用，给轻量女体单独生成适配标识和配色版本。暖肤涉及已经缩为 1K 的身图，本次候选继续使用原肤色。普通同机制数据通过头部登记表接入。[旧版拒绝](before-plan/plan.json) · [离线几何和原图复算](report.json) · [登记表](../../prototype/src/fitted-head-appearances.json)

新构建的两次独立检出产出相同的 529 个文件。制作 CLI 执行同一批，两条签名不同；独立接收包 36 文件，打开及重开均读取各自的保存结果。开发机 Chrome 157 录制两人讲话及一人房间走坐起。近景使用同一站立相位、相同镜头位置与目标。首轮诊断按自然时钟暂停，两次头部跟随镜头位置相差约 2 mm，已保留失败回执。第二轮统一站立相位后，两组相机坐标完全一致。[制作计划](plan/plan.json) · [固定重建](rebuild.json) · [独立游戏回读](independent-game/report.json) · [首轮近景](portraits/report.json) · [同镜头检查](portraits-fixed-pose/report.json)

两角色合计估算 65 个贴图对象、241,873,236 字节含 mip。个性化相较原色增加 34,253,820 字节，其中短发模型占 11,185,148 字节，8 张按角色生成的贴图占 23,068,672 字节。普通电脑实际帧耗时及物理显存仍待测。此处发布技术候选供内部制作验证，正式准入和画风验收分别记录。[逐项静态预算](budget-signed-pair.json)

## 复建

开发机另行关闭录屏，在 Chrome 157 的 1440×1000 视口短测待机／讲话，三组各 12 秒。渲染器记录的纹理计数从空场景 1 升到金发 41、原色 37、双人 77，销毁后均回到 1。双人刷新间隔 p95 为 6.2 ms、最大 6.3 ms。运行计数与源模型静态估算口径不同，留待记录实际显存时继续核对。[开发机样本与生命周期](development-budget/report.json) · [正常速度录像身份](films.json)

在主工程内用 `scripts/character-worktree.py create` 建立 `ba9a95f6 --runtime-only` 的固定检出，按上一包的工程内 TEMP、TMP、npm 缓存和依赖锁步骤构建，核对 `build-info.json` 的 `f7ea73f3ec73`。给运行检出加上 `scripts` 与 `assets-source/garment-basecolor-release-v1` 稀疏检出项。[上轮构建命令](../m2-motion-response-compat-v1/README.md)

```powershell
$game = 'experiments/worktrees/head-ba9a95f6'
$e = 'evidence/m2-uniform-lite-head-intake-v1'
$out = 'output/replay-uniform-head'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/uniform-lite-top-matrix.json assets-source/variant-matrix-v1/uniform-lite-top-head-request.json --input-root . --root $game --diagnostic --output "$out/plan"
node scripts/character-production-cli.cjs --dist "$game/prototype/dist" --request "$out/plan/diagnostic-requests/create-001.batch.json" --out "$out/new-signed.json" --evidence "$out/producer"
node scripts/runtime-package/game-record-cli.mjs export --dist "$game/prototype/dist" --source-root $game --records "$e/signed-pair.json" --inventory "$e/inventory.json" --out "$out/archived-game"
node scripts/run-fixed-check.cjs "$out/archived-game" scripts/qa-production-package.cjs "$out/cold-check" "$e/signed-pair.json"
```

新的制作时间会进入新记录签名。复验已交付包时，命令使用归档签名及其清单。原配色与金发配色各有数据成本和兼容范围；其他发型、其他身体、新颜色组合需按其实际资源复算。
