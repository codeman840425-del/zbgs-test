# 男女制服双人包

[打开女性原身体与轻量身体的 1 倍速房间对照](index.html)。两段录像均用轻量上衣、及膝裤、平底鞋，人物走向椅子、坐稳、起身、离开。每段约 17 秒，实际解码 514 帧。用同一版游戏采集，构建号为 `b37d45ef0fe4`，对应源码 `553906dbac9d1ca5e2464e004ff5ef23d71ede0c`。[录像身份](decoded-video.json) · [本地播放器实测](playback.json) · [两次独立构建](rebuild.json)

| 独立游戏包 | 男女原上衣 | 男女 1K 上衣 |
|---|---:|---:|
| 实包大小（34 个文件，含清单） | 47,792,412 字节 | 43,841,934 字节 |
| 两名角色选用资源的 RGBA8 含 mip 估算 | 242,921,816 字节 | 209,367,384 字节 |
| 单件上衣估算 | 各 22,719,144 字节，超 16 MiB | 各 5,941,928 字节，通过 |
| 独立浏览器首次加载、关闭重开 | 男女服装均恢复 | 男女服装均恢复 |

每种上衣配置各执行一次双人批次，产生相同的两个稳定角色 ID。两批分别初签，修订号均为 1。接收游戏只请求本批选中的上衣，并逐项核对实际响应。两角色独立的初签输入和结果均可回读。[原上衣生产输入](near-batch-input.json) · [轻量上衣生产输入](far-batch-input.json) · [原上衣冷开](cold-near/report.json) · [轻量上衣冷开](cold-far/report.json)

女性生产配方把实际皮肤图从 2048² 派生为 1024²，同时缩小模型的元数据缩略图。皮肤、骨架和四件装备的适配证据随资源保存。换上衣时两款各按本体的 252 个三角形恢复覆盖关系。角色收到 HTTP 503 时保留原上衣和遮罩。站立、坐下、还原时继续记录逐像素差。坐姿正面换回旧衣有 1 个像素相差 1/255。坐稳时两个候选都采到座面投影内的 573 个裤装顶点和 570 个鞋顶点，距离变化为零。新旧基础人体诊断的头发与材质显示策略不同，观看对比宜用同衣镜头。[源身体和派生资源](source-body.json) · [绑定与覆盖](fit.json) · [同镜头坐姿](seated-dressed-side.png) · [坐姿取样](pose-comparison.json) · [换装与失败恢复](outfit-rollback.json)

两段录像在 RTX 4090 开发机采集，浏览器刷新间隔 p95 均为 6.2 ms，最大均为 12.1 ms；录像最大帧间隔均为 43 ms。普通电脑的真实帧耗时、显存及公开发行资格仍待确认。适用范围为这两具制服候选、原发原色和已测装备。

## 从固定源码重建

使用主工程的固定构建工具或工作树命令。在同一工程内准备运行检出，依赖按 `prototype/package-lock.json` 安装。构建前把 TEMP、TMP 和 npm 缓存指向工程内目录。核对 [rebuild.json](rebuild.json) 所列的源码、Vite 构建号和依赖锁。已有对应构建时可直接复用。生产入口可用 `python -B scripts/production/register_texture_outfit.py female --check` 和 `male --check` 复核两具身体。双记录打包复算示例如下，使用带本次评审清单的制作工具。

```powershell
$fixed = 'experiments/worktrees/female-uniform-553906db'
$e = 'evidence/m2-female-uniform-texture-game-v1'
$out = 'output/replay-dual-uniform'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
$env:TEMP = (New-Item -ItemType Directory -Path "$out/temp").FullName
$env:TMP = $env:TEMP
foreach ($tier in 'near','far') {
    $signed = "$e/$tier-records.json"
    $other = if ($tier -eq 'near') { 'far' } else { 'near' }
    node scripts/runtime-package/game-record-cli.mjs inventory --source-root $fixed --dist "$fixed/prototype/dist" --records $signed --out "$out/$tier-inventory.json"
    node scripts/runtime-package/game-record-cli.mjs export --source-root $fixed --dist "$fixed/prototype/dist" --records $signed --inventory "$out/$tier-inventory.json" --out "$out/$tier"
    node scripts/run-fixed-check.cjs "$out/$tier" scripts/qa-garment-cold-package.cjs b37d45ef0fe4 $signed "$e/$other-records.json" "$out/test-$tier"
}
```
