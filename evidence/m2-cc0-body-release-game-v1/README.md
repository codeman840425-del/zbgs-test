# 制服男体的身体贴图与游戏交付

[同镜头、1 倍速前后对照](index.html)。两个实际人物分别在同一固定房间内走到椅子、坐稳、起身、离开。两段 17 秒，逐段解码 514 帧。人物都穿同一件轻量上衣、长裤和平底鞋。源运行提交 `4636fe861238ed25aa2a4725ff1e5becf328cb5d`，构建 `f4966554bcfc`。两份干净检出的 522 个文件逐字节一致。[录像校验](decoded-video.json) · [重建校验](rebuild.json)

| 已签角色 cc0-uniform-body-texture-v1 | 原上衣 · 修订 1 | 1K 上衣 · 修订 2 |
|---|---:|---:|
| 实际独立游戏包文件数 | 26 | 26 |
| 游戏包字节 | 32,523,375 | 30,503,829 |
| 所选资源的 RGBA8 含 mip 估算字节 | 122,334,892 | 105,557,676 |
| 当前静态预算 | 原上衣超限 | 身体与三件装备均通过 |

独立游戏在两次全新浏览器会话中恢复同一角色及其装备，并核对实际下载的 SHA 与字节。两个包均未请求另一件上衣。[原上衣冷开](cold-near/report.json) · [轻量上衣冷开](cold-far/report.json) · [打包及来源](closure.json)

身体制作保存了原始文件、配方和逐字节复算记录。身体文件减少 2,217,252 字节，单身体静态贴图估算由 109,402,460 降至 92,625,244 字节。游戏中的身体底色与阴影贴图实际读到了新尺寸。站立和坐稳的六组同镜头对照中，时钟、骨骼和镜头的最大差均为零。坐稳时有 513 个裤装顶点落入座面投影，536 个鞋顶点进入鞋底取样；此姿势的新旧距离差为零。衣物换回后静止站姿图一致，坐姿近景有 2 个像素、房间视角有 1 个像素相差最小颜色刻度。上衣故障返回 HTTP 503 时保留原装备。普通电脑缺设备；完整游戏的公开分发条件待核。[静止比对](pose-comparison.json) · [坐姿并排图](seated-dressed-side-figure-source-left-release-right.png) · [换装回滚](outfit-rollback.json) · [来源和许可范围](../m2-cc0-body-release-fit-v1/rights/README.md)

开发机使用 RTX 4090、Headless Chrome 157、1440×1000 浏览器窗口。原身体和轻量身体在录像期间的帧间隔 p95 均为 6.2 ms，最大分别 12.1 和 18.3 ms。两段 30 Hz 录像的最长帧间隔均为 43 ms。这些数据分别描述浏览器刷新与编码录像，尚无普通电脑帧耗时和实际显存字节数。[原身体逐帧计时](room-original/report.json) · [新身体逐帧计时](room/report.json)

## 在新检出中复算

从包含本说明的角色工程根目录运行。制作脚本、锁文件、源 VRM、编辑用 Blender 重建文件及两个签名输入随工程保留。生产使用 Python 3.13.11、Pillow 12.1.0、NumPy 2.4.2 和 zlib 1.3.1，游戏构建使用 Node 24.13.0、npm 11.6.2。先按[制作与适配](../m2-cc0-body-release-fit-v1/README.md)生成身体及四份装备适配，再执行以下 PowerShell。新检出的 Git 应含上述固定提交，浏览器验证使用已安装的 Chrome。

```powershell
$scratch = New-Item -ItemType Directory -Force -Path 'output/character-work-temp'
$env:TEMP = $scratch.FullName
$env:TMP = $scratch.FullName
$env:npm_config_cache = Join-Path $scratch.FullName 'npm-cache'
python -B scripts/character-worktree.py create cc0-body-rebuild 4636fe861238ed25aa2a4725ff1e5becf328cb5d --runtime-only
$fixed = 'experiments/worktrees/cc0-body-rebuild'
npm --prefix "$fixed/prototype" ci
npm --prefix "$fixed/prototype" run build
npm --prefix prototype ci
$dist = "$fixed/prototype/dist"
$evidenceDir = 'evidence/m2-cc0-body-release-game-v1'
$out = 'output/cc0-body-receive'
New-Item -ItemType Directory -Path $out -ErrorAction Stop | Out-Null
foreach ($tier in 'near','far') {
    $records = "$evidenceDir/$tier-records.json"
    node scripts/runtime-package/game-record-cli.mjs inventory --source-root $fixed --dist $dist --records $records --out "$out/$tier-inventory.json"
    node scripts/runtime-package/game-record-cli.mjs export --source-root $fixed --dist $dist --records $records --inventory "$out/$tier-inventory.json" --out "$out/$tier"
    $other = if ($tier -eq 'far') { 'near' } else { 'far' }
    node scripts/run-fixed-check.cjs "$out/$tier" scripts/qa-garment-cold-package.cjs f4966554bcfc $records "$evidenceDir/$other-records.json" "$out/test-$tier"
}
node scripts/run-fixed-check.cjs $dist scripts/qa-production-record-room.cjs "$evidenceDir/far.json" "$out/room"
```

生产入口为 `scripts/character-production-cli.cjs`；初签输入见 [create.json](create.json)，编辑输入见 [edit-far.request.json](edit-far.request.json)。重用已签记录可以逐字节核对交付包；重新签发会记录本次的制作时间。另一份同源 CC0 原始导出还独立复算了不透明皮肤处理，运行时及准入范围仍按各身体单独记录。[可重复派生操作](../m2-cc0-body-release-fit-v1/production-operation.md)
