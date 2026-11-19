# 从默认款式目录制作两名轻量制服角色

美术 Agent 可提交包含单个款式及多个身体版型的候选片段。款式标识和款名沿用标准目录。每个版型单独声明身体、版本、资源、绑定及身体覆盖。颜色、穿着或脸部规则仍取自实际选中资源。原 1K 制服片段的 SHA 保留为 `9f773856…`，原有角色记录可继续恢复。

同一份男女戴镜制服配方在原默认目录被逐人拒绝，原因为缺少精确版本。导入该片段后，固定游戏源码 `51857788`、构建 `3b64a5dad472` 的浏览器实际加载两具身体，各查到一个精确的 1K 上衣候选。通过默认目录生成的两个制作请求与上一包显式指定片段时逐字节一致。游戏重新制作、签出并回读两份造型，女角色选中套装 5，男角色选中套装 1。逐人比对身份、服装、色彩、适配、道具和资源依赖均相同，签发时间和签名分别保留。正式套装批准仍为 0/2。[同输入修前结果](before/plan.json) · [修后试制](plan/plan.json) · [正式结果](formal/plan.json) · [签名与依赖比较](comparison.json)

本构建的正常速度片段可直接打开。[女角色](producer/item-0/produced-1x.webm) · [男角色](producer/item-1/produced-1x.webm) · [逐人回读](producer/report.json)。上一固定构建的[独立包冷开、故障隔离及房间动作录像](../m2-uniform-lite-glasses-game-v1/index.html)保留原构建身份。

## 美术交付与登记

在含此版本的工程中，运行以下命令核验登记。导入新片段时用 `--output` 给出工程内的新文件名，检查生成的候选矩阵后纳入版本管理。同键异资源会拒绝，旧表保留。

```powershell
python -X utf8 -B scripts/production/register_equipment_style.py --fragment assets-source/variant-matrix-v1/uniform-lite-top-matrix.json --label 基础制服上衣
```

复建此游戏版本时，沿用[固定检出与依赖安装步骤](../m2-uniform-lite-glasses-game-v1/README.md)，将提交设为 `51857788`，检出和输出均用新目录。基于该检出实际制作如下。

```powershell
$inputDir = "$game/assets-source/variant-matrix-v1"
python -B scripts/production/variant_batch.py "$inputDir/representative-matrix.json" "$inputDir/uniform-lite-glasses-request.json" --root $game --diagnostic --output "$out/plan"
node scripts/character-production-cli.cjs --dist "$game/prototype/dist" --request "$out/plan/diagnostic-requests/create-001.batch.json" --out "$out/new-signed-pair.json" --evidence "$out/producer"
```
