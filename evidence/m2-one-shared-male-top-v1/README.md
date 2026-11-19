# 两个已有脸型穿同一件新上衣

普通游戏构建 `8aaed16af2aa`，运行源码 `1683a4124b8fb97ee202c4c2d0757c0890bcc76b`，含座椅登记的制作工具 `4654b65b1f9fcbc11f87b816a116c5693ffc7d1a`。技术自测在开发机 Chrome for Testing 145 完成。融合独立验收、普通电脑性能和整套发行审批仍待对应验证。

[双人原速录像](game/produced-pair-1x.webm) · [游戏截图](game/produced-pair.png) · [原制服与新款](../../assets-source/shared-male-studio-top-v1/rest-comparison.png)

## 本次结果

| 检查 | 可复核结果 |
| --- | --- |
| 同身体、不同脸 | 两份已有配方共用同一个男体 VRM、躯干及骨架。眉、眼、鼻、口沿用既有几何选项，A/B 的脸部皮肤顶点最大相差 5.417 毫米。游戏签发请求保留两人相同的默认配色。[身体实测](body/body-proof.json) · [双人原请求](request.json) |
| 旧版首拒 | 旧制作命令只有已发布款式和矩阵片段入口。旧游戏 `241ce1c278f0` 的男体查询中有 7 套装扮，无此款 ID；同一双人请求在第一人的装备选择即被明确拒绝。[历史工具参数实测](old-import.json) · [普通入口首拒](before/report.json) |
| 新款导入 | 经公开命令一次发布源衣，新注册只关联一具实测身体。新目录保留旧 7 套，增加 1 个以新上衣替代旧上衣的搭配。上衣 290,240 字节，1,399 个蒙皮顶点，10 根骨。见两次真实浏览器查询摘要。[登记回执](import.json) · [旧新目录](catalog-comparison.json) |
| 普通游戏 | 两个独立角色同时装备 `shared-male-studio-top-v1`，沿用原长裤和平底鞋。普通游戏包只含一份本款 GLB，两人轮流挥手。关闭页面重开后，各自记录和可见装备相同。错误 ID、错槽位、错身体的三次请求均被拒绝，保留原穿戴。[原签](records.json) · [运行报告](game/report.json) · [包清单](inventory.json) |
| 固定与范围 | 两个独立检出构建的 557 个文件逐字节一致。普通交付包有 41 个文件，含自身清单。角色生产与游戏回读属于开发侧验证；矩阵维持 `candidate`，正式整套装扮的审批状态见目录快照。该上衣的版型范围是既有标准男性躯干、平底鞋与长裤。 |

旧的资源收集测试曾用 4196 的历史 dist 配上新源码，提示缺少新增目录。显式对准本轮固定 dist 后，原 13 项资源收集回归全部通过；没有修改旧平台文件。4196 和公司平台仍各自用于人类预览。

## 观看与来源

解压交付 ZIP，双击根目录的 `open-game.cmd` 进入带椅子的房间。需装有 Python 3 和支持 WebGL 的浏览器；关闭命令窗口即释放端口。再次打开使用相同本机地址，便于浏览器读取原存档。房间内可以选择 A、走到椅子坐下并保存，重开后点“恢复”；起身后选择 B 即可使用同一把椅子。只看录像可直接打开包中 `evidence/game/produced-pair-1x.webm`。角色造型与新版上衣的可编辑配方、制衣脚本、母版 VRM、重建的 Blender 文件及发布者许可记录随包保存。[衣物制作说明](../../assets-source/shared-male-studio-top-v1/README.md) · [来源及限制](../../assets-source/foundation-male/LICENSE.md)

## 制作与复核

在具备原仓库历史的制作检出切至上述工具版本。交付包内 Git 增量包含相对 `f915ce6539e043961a7f25cbb0648ff5b84529ff` 的制作、登记与固定运行评审改动。原始配方中包含绝对尺寸和上游资源摘要。接收普通游戏只需运行已交付的包；下列命令供制作方从源复核。

```powershell
python -B assets-source/shared-male-studio-top-v1/build.py --check
python -B scripts/production/register_equipment_style.py --top assets-source/shared-male-studio-top-v1/recipe.json
```

首次引入未登记源件时，第二条命令追加 `--install`。本候选已完成该步骤。再签发时使用随包同一份 `request.json`，每次在工程内选一个新的输出目录。新签含创建时间，验收旧签时使用随包的原始 `records.json`。下列示例以两份已固定原签导出。

```powershell
$fixed = 'experiments/worktrees/shared-top-a-1683a412'
$dist = "$fixed/prototype/dist"
$ev = 'evidence/m2-one-shared-male-top-v1'
$run = 'output/shared-top-replay'
New-Item -ItemType Directory -Path $run -ErrorAction Stop | Out-Null
node scripts/character-production-cli.cjs --browser-config scripts/production/fusion-cft145.json --dist $dist --request "$ev/request.json" --out "$run/new-records.json"
node scripts/runtime-package/game-record-cli.mjs inventory --dist $dist --source-root $fixed --records "$ev/records.json" --out "$run/inventory.json"
node scripts/runtime-package/game-record-cli.mjs export --dist $dist --source-root $fixed --records "$ev/records.json" --inventory "$run/inventory.json" --out "$run/game"
node scripts/run-fixed-check.cjs "$run/game" scripts/qa-production-package.cjs "$run/smoke" "$ev/records.json" --shared-top shared-male-studio-top-v1 --browser-config scripts/production/fusion-cft145.json
```

新环境按锁文件构建运行源码。使用 `python -B scripts/character-worktree.py create shared-top-a-1683a412 1683a412 --runtime-only`，在其 `prototype` 下用工程内 npm 缓存运行 `npm ci`、`npm run build`，成品摘要应为 `8aaed16af2aad1aae514d90c371a95a1f27169441a608beeee6c68d317257775`。交付的运行清单 SHA-256 为 `aa89ae2e60e97597a56d27c95e6f4ddb8966f0e05e8e7a1e782243bc4c159c1d`。

## 同版房间与保存恢复

开发侧在 `plant-home` 用界面按钮让 A 实际走到椅子、坐稳、保存，确认浏览器进程退出。第二个浏览器进程从同一磁盘配置读取到逐字节相等的存档，恢复 A 的坐姿和座位占用。随后 A 起身，B 走到同一把椅子、坐下并起身；四项动作均完成。两次接近的累计水平路程约为 1.08 和 3.77 米。房间全景可判断接近与使用过程，椅背遮住部分腰部。融合仍需以同一固定输入独立验证。[关闭前原速录像](room-restart/before-close-1x.webm) · [新进程恢复与 B 入座原速录像](room-restart/after-restart-1x.webm) · [两进程回执](room-restart/report.json)

`desktop-plants-v1.1` 公司交件清单 SHA-256 为 `6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2`。首次组合被打包器以缺少 `seat-v1` 拒绝；核实同版座椅、导航、占用、保存协议和编译文件后登记该协议，沿用原有打包与交互代码。固定房间包清单 `319d42855b752836c45eb8c6ea204d0c57557ab6399f6152625ae75e3de57d6d`，内含原签、服装、地面、家具和使用点。[房间回执](room-package.json) · [座椅协议复核](seat-contract.json)

包内 `game` 为已组合的固定房间，可直接接收；`inputs/desktop-plants-v1.1` 保留验签过的原公司交件。若需重复制作，在上述普通游戏导出后运行下列命令，`$transfer` 指向解压后的这个输入目录。

```powershell
node scripts/production/package-facility-room.mjs --game "$run/game" --game-sha256 aa89ae2e60e97597a56d27c95e6f4ddb8966f0e05e8e7a1e782243bc4c159c1d --room $transfer --out "$run/facility-game"
node "$ev/check-room-restart.cjs" "$run/facility-game" 319d42855b752836c45eb8c6ea204d0c57557ab6399f6152625ae75e3de57d6d "$run/room-restart" plant-home
```

接收方如需使用随包的复核脚本，在自己的独立检出读取 Git 增量的 HEAD，使用该检出内的脚本和输出目录。脚本使用锁定的浏览器，启动一个短时本机服务；浏览器临时文件和专用配置均在接收方工程内释放。普通游戏包已经包含已登记服装、两条原签和可交互房间，可离线运行。签发新角色和复核既有原签是两种独立操作。
