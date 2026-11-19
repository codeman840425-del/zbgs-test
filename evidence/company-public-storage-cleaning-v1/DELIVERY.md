# 公共储物清洁间

固定源码 `9193f17250c0d663cc90809a679fe66437f25241`，查看器 `f47fcca3412a`。独立接收方用空缓存安装依赖，重建的 669 个运行文件与交付原件逐字节一致。正式目录为 `company-workspace/deliveries/public-storage-cleaning-v1`；归档后实核全部 2430 个文件。[版本身份](identity.json) · [归档核对](sealed-package.json) · [接收方复产](receiver.json)

| 实际房间 | 可观看内容 |
| --- | --- |
| 整层一层，大厅直达 | 中层架上的开口耗材箱、推车下层的提篮、铰链柜与门口。[全景](browser/public-storage-floor-overview.png) · [29.96 秒原速录像](browser/public-storage-floor-normal.webm) |
| 大楼二层，沿公共区域进入 | 反向放置的柜架、补货纸箱和车上的布巾盘。[全景](browser/public-storage-building-overview.png) · [28.52 秒原速录像](browser/public-storage-building-normal.webm) |

两套布局都能在开放架和推车上独立更换四款耗材。入门检查覆盖柜门关闭、半开、全开，量到层架和推车分别有约 31 和 38 厘米的前取行程。放低托板、封住取物面或在门扇扫过的位置放置挡片都会被识别；用推车堵门时保存保留原布局。一层推车下篮在全景中受上层板部分遮挡，选中可近看。一次合法的推车移动和 90° 转向也保留了提篮的父级、板面和底部接触。[四款近照](four-shelf-loads.png) · [承托测量](installation-measurements.json) · [通路和失败回执](room-admission.json) · [推车与子件](stocked-cart-move.json)

接收方把握把从 27 厘米提高到 29.5 厘米，经正式发布入口登记 v2，在两房分别通过批量配方和单房编辑安装。接收构建 `815ce8c4eae6` 经普通文件导入大楼二层存档、保存、关闭和重开，实际加载的网格仍是 v2。首次接收测试误将改写批量配方后的来源签名与单房编辑的原签名要求相同；修正后分别校验来源，再对比相同空间和设施状态。[接收方重开画面](receiver-high-handle.png) · [二层 v2 存档](receiver-building-save.json) · [首次诊断](receiver-first-attempt.json)

在原包运行 `node verify.mjs` 可以核对文件。`node serve.mjs` 打开的本机页面可按房间直达。制作、改款和位置校验的可重复命令见随包说明。四款数量对应层板物；柜、架、推车复用各自的安装规格。录像使用 Chromium 软件渲染；本次测量覆盖静态空间与设施，清洁经营、真实人物取物和普通电脑性能另行验证。[接收与制作说明](../../docs/research/COMPANY-PUBLIC-STORAGE-HANDOFF.md) · [录像与冷启回执](browser/recording-probe.json)
