# 两名配方角色的图像解码和离场释放

游戏源码 `bc42048fcf63c4d55c1c5fd80b4e1679307af8d3`，固定构建 `241ce1c278f0`。两次独立重建后导出两份原签的普通游戏包。旧构建 `f90136db446c` 使用相同的角色、绑定、制服和动作数据，共 25 个数据文件字节一致。[正常速度游戏录像](game-cold/dual-external-cold-1x.webm) · [普通游戏关闭重开与损坏恢复](game-cold/report.json)

| 同一进程内的操作 | 画面使用的位图 | 旧版累计显式关闭 | 新版累计显式关闭 |
| --- | ---: | ---: | ---: |
| 两名角色首次入场 | 46 | 0 | 0 |
| 移除 A，保留 B | 23 | 0 | 23 |
| 移除 B | 0 | 0 | 46 |
| 再次载入原来两人 | 46 | 0 | 46 |
| 移除 B，保留 A | 23 | 0 | 69 |
| 移除 A | 0 | 0 | 92 |

每个版本各用了两个新的 CfT 145 进程。旧版释放了 WebGL 纹理句柄，却把解码后位图的清理留给浏览器。新版由实际解析该身体或衣物的加载器负责关闭私有内嵌图像，共享法线图由最后一名使用者释放。解析失败、切换时卸载、图像晚到以及同一图像被多个材质引用均有回归。Three 对 glTF 图像有专门的资源释放说明。[Three 官方说明](https://threejs.org/docs/pages/GLTFLoader.html) · [已安装版本的资源所有权测试](../../prototype/src/embedded-bitmap-owner.test.mjs)

两种移除顺序下都从留下的角色选取正在绘制的一张 512×512 图像，向原 WebGL 纹理句柄实际重传一次。两个新进程共四次，同一帧重传前后像素差均为 0。临时隐藏该角色会改变超过四万个像素，恢复可见后画面完全一致。默认读取的两份旧版轨迹均在第一名角色卸载时被新检查拒绝。[旧版数据](before/report.json) · [旧版实际拒绝](before-release-check/report.json) · [新版逐对象与逐帧回执](after/report.json)

在未染色的这批原签中，首次加载每人产生 23 张位图；两人图像的累计 RGBA8 当量为 124,781,568 字节。再次加载两人会再次解码。新版在角色全部离场后，归属到本次装扮且仍未显式关闭的位图为 0。页面首次取得两个 1×1 的 2D Canvas 上下文，未统计之后的 Canvas 尺寸变化。解码 Promise 计时含排队，无法据此计算纯解码 CPU 耗时、物理内存回收时点或显存峰值。结果仅代表该开发机、这套服装及本页主线程。普通电脑及染色、编辑时使用的其他 Canvas 路径另行验收。

## 待审片单

三段均为构建 `241ce1c278f0` 的 1× 原片，观感待用户审看。工作台两段分别使用 A 与 B 自己的原签，普通游戏一段同时使用这两条原签。点击片名可直接打开本机录像。

| 录像 | 容器时长 | 观看范围 |
| --- | ---: | --- |
| [A 单人工作台](public-batch-a/room-produced-1x.webm) | 17.082 秒 | A 穿三件制服走近、坐稳、起身、走离。 |
| [B 单人工作台](public-batch-b/room-produced-1x.webm) | 17.085 秒 | B 穿同款制服完成同样的动作，核对自身贴合和接触。 |
| [A+B 普通游戏](game-cold/dual-external-cold-1x.webm) | 9.480 秒 | 同屏出场，两人各自招手并回落。 |

片单保留原签、构建完整摘要、普通包 SHA、三段录像和回执的文件路径、大小与 SHA。复跑用本机 PyAV 读取容器并解出首帧，同时拒绝错签房间报告、旧构建摘要、旧普通包和错配录像。无需重录。[机器片单](visual-review-playlist.json) · [单人原签回执](two-rooms.json)

```powershell
python -B F:/gamemake/evidence/m2-rule-image-lifecycle-v1/visual-review-playlist.py
```

## 重放

两份独立构建的 555 个文件、767,641,841 字节一致。导出的普通游戏含清单共 37 文件、42,820,387 字节。静态成本按两套真实身体包和原签重算，资源闭包 22 个文件，双人纹理 RGBA8 含 mip 的估算共 211,115,352 字节。[构建与游戏包摘要](build-and-package.json) · [静态预算](current-cost/static.json)

开发机 Ryzen 9 9950X3D、RTX 4090、CfT 145.0.7632.6、1440×1000。普通包冷开后重新选择 A、B 和两人，各观测 12 秒站立讲话。三组帧间隔 p95 均约 6.2 ms，最大值依次为 7.0、6.4、6.9 ms，采样窗口内超过 33 ms 的帧数均为 0。单人时 Three 纹理数为 39，双人为 77，全部卸载后为 1。换装、舞蹈和普通电脑性能另需实测。[完整逐帧及环境记录](current-cost/report.json)

同构建普通游戏恢复了两条原签。九项选装检查覆盖错摘要、错身体、更换成同伴的上衣、缺件、记录被改、装备响应失败以及修正重试。可从任意目录运行 `python -B F:/gamemake/evidence/m2-rule-image-lifecycle-v1/verify-lanes.py`，用原生产校验器复查动作、恢复、选装以及预算对应的构建和角色身份。[游戏记录恢复](restore/report.json) · [九项检查](guards/report.json) · [普通机、人工观感和权属的实际交件](pending-signoffs.md)

游戏清单 `0d3edadf098d99d985a816adccdaa7a97895498f6c7da3006cd849cdafa5e392`。按[上一版普通包的独立重建步骤](../m2-rule-formal-room-v1/README.md)使用本页源码提交、新工作树、同样两份原签和原身体包。单次浏览器输出使用工程内尚不存在的目录。

```powershell
$game = 'output/m2-rule-image-release-build-v1/game'
$records = 'evidence/m2-rule-batch-delivery-v1/records.json'
$config = 'scripts/production/fusion-cft145.json'
$packageSha = (Get-FileHash "$game/runtime-package.json").Hash.ToLowerInvariant()
node scripts/run-fixed-check.cjs $game scripts/qa-record-image-lifecycle.cjs $records output/image-release-replay 241ce1c278f0 --ordinary-package $packageSha --browser-config $config --require-release
node evidence/m2-rule-image-lifecycle-v1/replay.cjs
```

最后一条命令只读重放两份已存普通包和轨迹，复核每一个应关闭和应保留的图像标识、幸存角色画面及两次独立冷开。旧版初次采集脚本对应提交 `664ea0d0`，新版采集增加了同帧重传和逐对象关闭检查。

### 复用性能采集入口

在实际测试机安装锁定依赖，用其已安装的 Chrome、同版已重建的普通游戏包及原签运行。复制[实测配置](development-capture.json)到工程内，将 `deviceDescription` 改为现场设备并选择 `headed` 或 `headless`。从工程根可执行下列命令，输出目录须为新目录。

```powershell
node scripts/run-fixed-check.cjs $game scripts/qa-record-budget-runtime.cjs $records output/reference-device-capture 241ce1c278f0 --ordinary-package $packageSha --capture-config output/device-capture.json
```

本次从 F 盘根目录运行原命令的已核验浏览器配置变体。RTX 4090 开发机上的三个视口实际均为 1440×900，各录得 1,979 个帧间隔，实测渲染器、浏览器版本和自报设备信息分别保存。采集状态为 `measured-capture-only`，普通机验收仍为 `not-assessed`。[配置演练的原始运行报告](reference-dev/report.json)
