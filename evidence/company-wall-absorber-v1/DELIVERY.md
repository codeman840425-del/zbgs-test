# 工作室和出租屋的墙装吸声板

固定源码 `b59b9b1e1b427ee64aa10f89b0aa2ea8a4923594`，构建 `9248a1708658`。正式目录是 `company-workspace/deliveries/wall-absorber-v1`。接收方从空 npm 缓存安装，重建的 689 个运行文件逐字节相同。归档后复核 2,508 个文件全部匹配。[版本与录像哈希](identity.json) · [归档核对](sealed-package.json)

| 房间 | 可直接观看的结果 |
| --- | --- |
| 唱播工作室 | 南墙门侧安装，补光灯支臂与墙板错开。视频含墙体剖切与恢复、换款、沿墙微调、背景遮挡拒绝和保存。[23.28 秒原速操作](browser/wall-absorber-studio-normal.webm) · [房内近景](browser/wall-absorber-studio-direct.png) |
| 出租屋唱播间 | 改挂东墙。旋转后的墙面沿用相同的背面挂点，门洞错误落位保留原布局。[29.60 秒原速操作](browser/wall-absorber-rental-normal.webm) · [房内近景](browser/wall-absorber-rental-direct.png) |

蜂窝毡、木格、软包、泡棉可在同一安装位替换。四款均有 0.60 × 1.20 × 0.08 米的实体造型，已逐款完全关闭浏览器、重开并核对存档。工作室初选位置被补光灯支臂挡住了两个采样点，沿墙移动 35 厘米后，两房各五个取景采样点均可见。摆位检查覆盖相邻墙、背景、整板包围和隐藏楼层。首次测试夹具仍占据旧背景位置，原失败记录保留。[模型对照，右侧为另制的人字格](physical-panels.png) · [摆位检查](room-admission.json) · [首次测试](first-admission-attempt.json) · [浏览器实测](browser/report.json)

独立接收方使用随包的 Blender 可编辑源重建人字木格，再将每对木条的中部与外端垂直高差由 83 毫米调为 105 毫米，通过公开命令重新导入并登记为木格 v2。接收构建 `aa6120db43c1` 在普通物品面板原位换上新版，重启后仍是 17 个部件的人字格，九个背面测点均贴墙。原版可再次选用。错误来源哈希会在改写目录前被拒绝。[接收方重开截图](receiver-cold.png) · [独立复产记录](receiver.json) · [原生产与拒绝检查](producer.json)

在正式包根运行 `node verify.mjs` 校验文件，运行 `node serve.mjs` 打开预览。将浏览器链接的查询部分改为 `?delivery=wall-absorber-studio&object=wall-absorber-studio/ground/live/absorber` 可直达工作室墙板。出租屋使用 `?delivery=wall-absorber-rental&object=wall-absorber-rental/ground/live/absorber`。接收方可在包的可编辑源码副本中参照生产指南改款。本次覆盖墙板生产、挂载、取景和保存，真实声学效果与角色动作均未测。录像使用 Chromium 软件渲染。[素材配方与独立导入命令](../../assets-source/company-wall-absorber-v1/README.md) · [录像核验](browser/key-frame-probe.json)
