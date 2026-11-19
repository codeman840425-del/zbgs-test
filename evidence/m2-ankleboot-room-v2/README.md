# 同一男体的踝靴与裤口

[打开 1 倍速前后对照](index.html)。房间片各约 26 秒，脚部近景各约 11 秒。固定镜头的行走、入座、起身和短舞使用相同指令。近景片单独追踪角色，含坐稳时换回原平底鞋。

| | 原版 | 配套裤口 |
| --- | --- | --- |
| 固定源码 | `2deb189b5301e4f191136cc032f6b3adf58d97d2` | `6aff566f4e338f263c96004d4850e9abc961d82c` |
| 构建 | `07958ad5d085` | `dca61742f36d` |
| 独立检出重建 | 536 个文件相同 | 537 个文件相同 |
| 后一次迈步的右脚，近景可见裤面包围靴面的水平像素行 | 52 | 5 |
| 同一姿势，房间镜头 | 7 | 0 |

两个构建都从同一签名平底角色开始，经过穿靴、签出独立记录、冷开、坐姿换回平底。新裤口进入真实装备槽位，动作仍使用原长裤的接触配置。普通构建收到第一版诊断靴记录时拒绝该装备，原角色、材质与触地点完整保留。第一轮探针对拒绝异常的处理有误，原失败回执和实际复验均已归档。[原拒绝和恢复](../m2-ankleboot-room-v1/ordinary-rejection/run-W0FQII/report.json)

配套版坐稳时的裤管盖住靴筒。站立下仍有棕色穿出，迈步近景在脚跟侧面能看到两版均有的色块。裤口最大水平调整为 52.20 毫米，普通电脑性能和最终造型待验。六个诊断姿势、两个镜头的相位、位置和镜头矩阵逐项一致。采样筒之外和被遮住的表面不在可见皮肤计数内。[12 组对照](comparison.json) · [源版型和重建步骤](../../assets-source/ankle-boot-layers-v2/README.md)

## 复现配套版

从角色工程根目录运行。新建目录须位于工程内。第一条命令取出已固定的游戏，包含该次发布的两件装备与清单。独立重建详情和完整依赖版本见[固定重建回执](rebuild.json)。

```powershell
python -B scripts/character-worktree.py create ankleboot-review 6aff566f --runtime-only
$game = 'experiments/worktrees/ankleboot-review/prototype'
$scratch = (New-Item -Force -ItemType Directory output/ankleboot-review).FullName
$env:TEMP = (New-Item -Force -ItemType Directory "$scratch/tmp").FullName
$env:TMP = $env:TEMP
$env:npm_config_cache = "$scratch/npm-cache"
npm.cmd --prefix $game ci
npm.cmd --prefix $game run build
$dist = "$game/dist"
$stamp = (Get-Content -Raw "$dist/build-info.json" | ConvertFrom-Json).sourceDigest
$caseFile = 'assets-source/ankle-boot-layers-v2/room-case.json'
node scripts/run-fixed-check.cjs $dist scripts/qa-footwear-room.cjs $stamp evidence/m2-cc0-body-release-game-v1/far-records.json "$scratch/room" $caseFile
node scripts/run-fixed-check.cjs $dist scripts/qa-ankleboot-poses.cjs $stamp "$scratch/room/observed-ankleboot-v2-record.json" $caseFile "$scratch/poses"
python -B scripts/qa-ankleboot-cuff-mask.py "$scratch/poses/report.json" "$scratch/cuff-contours.json"
```
