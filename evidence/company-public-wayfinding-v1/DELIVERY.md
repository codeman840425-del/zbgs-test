# 来宾签到与培训报到

正式包位于 `company-workspace/deliveries/public-wayfinding-v1`。固定源码 `9a22c3b35d4830e4413eccf7b1ce90b82dda4dee`，运行构建 `05d98d4a2542`。归档后已重核全部 2469 个文件。独立接收方用空 npm 缓存安装锁定依赖，重建的 681 个查看器文件逐字节一致。[固定身份](identity.json) · [归档清单核对](sealed-package.json) · [接收方复产](receiver.json)

| 空间 | 观看与验收 |
| --- | --- |
| 整层大厅 | 入口处看到来宾签到牌，登记台上有笔和本，旁边有两个等候座位。[入口视角](browser/public-wayfinding-arrivals-arrivals-overview.png) · [38.80 秒原速录像](browser/public-wayfinding-arrivals-normal.webm) |
| 大楼二层 | 从大厅进入培训报到区域，登记台旁设衣架和夹克。长走廊全景中可定位牌框，聚焦后可读场次和寄衣说明。[培训牌近景](browser/public-wayfinding-training-training-sign.png) · [40.12 秒原速录像](browser/public-wayfinding-training-normal.webm) |

房间使用同一套牌框和四种可编辑图文。每层各有一块接待牌、电梯牌和楼梯牌。以门内 1.50 米高的参考眼位检查，每块牌的五条采样视线均先命中正确印面。批量制作、单房编辑和独立交付可以复用这些摆位。换框、关闭一块印面、保存并完全关闭浏览器后，两房的框和各自显示状态均可恢复。把楼梯牌翻向墙壁，或把其他用途图文装到报到点，会指出具体实例并保留原存档。[四种图文](four-prints.png) · [房间几何与八个失败输入](room-admission.json) · [实际浏览器操作](browser/report.json)

接收方从同包配方将“培训报到”改为“新人报到”，换了讲师图标和副标题，以 `wayfinding-training@2` 发布。接收构建 `23b5ac33d313` 在普通物品面板完成 v1 → v2 → v1 → v2，并在重开后保留 v2。首轮验收脚本没有计入换版时显式写入的原默认可见状态，终版修正了这项比较，保留原断言失败回执及原运行文件。[两版印面](training-v1-v2.png) · [接收方冷启动](receiver-training-restored.png) · [终版浏览器复验](receiver-browser.json) · [首次失败](first-receiver-attempt.json)

在包根运行 `node verify.mjs` 核对交付文件，`node serve.mjs` 打开预览。在源码副本生产图文、批量改房和复验的命令见[接收指南](../../docs/research/COMPANY-WAYFINDING-HANDOFF.md)。录像采用 Chromium 软件渲染。此包交付可编辑的空间、牌面和设施通路，角色签到业务、连续跨楼层移动与普通电脑性能另由对应阶段验证。
