# 桌面直播手机 · 固定交付

民房和转向 90° 的出租屋使用同一份桌面手机安装规格。两间房各实际替换了竖屏、横屏、托架和桌夹四种外观，开关屏幕并关闭浏览器重开。接收方在独立工作副本里用配方制作了第五款，只替换民房实例。[15 秒原速录像](browser/phone-rooms-normal.webm) · [四款浏览器回执](browser/report.json) · [第五款亮屏](receiver/fifth-lit.png) · [第五款关屏重开](receiver/fifth-restored-off.png)

| 项目 | 固定身份 |
| --- | --- |
| 源码提交 | `cb5f98fd78d3bc7876e0d8e9349e06a28bf25378` |
| 本机正式包 | `company-workspace/deliveries/desktop-phones-v1` |
| 正式构建 | `0bf32ea27a92`，清单 SHA-256 为 `b988f1382f3cac3ed58d3ccc917dc1473175ce16ebcd0c9b1f12ef5c1b24e7f8` |
| 独立复产 | `company-workspace/production-trials/phone-receiver-v1/published-phone-final`，构建 `d1e292b65407` |

在正式包根目录可核对全部 1,836 个清单条目并打开临时预览。浏览器地址加 `?delivery=phone-home` 或 `?delivery=phone-rental` 可选择房间。

```powershell
node verify.mjs . b988f1382f3cac3ed58d3ccc917dc1473175ce16ebcd0c9b1f12ef5c1b24e7f8
node serve.mjs 0
```

制作与测试在可写副本中进行。安装锁定依赖和浏览器后，运行 `node source/scripts/company-platform/qa-phone-rooms.cjs . 0bf32ea27a92 phone-browser-check --record` 可复测两房。生产步骤、接口尺寸、配方与许可见[制作说明](../../docs/research/COMPANY-PHONE-STATIC-PRODUCTION.md)。独立接收方重建的 535 个查看器文件与两间房的 8 个批次文件逐字节一致。第五款使用新配方导出，在实际浏览器里亮屏、关屏和重开后关屏均得到确认。记录包含坏状态拒绝并保留双房结果的检查。[独立复产回执](receiver/report.json) · [完整固定身份](identity.json)

接入中发现屏幕节点缺失的资源曾能通过登记。现已让登记和渲染共用显示节点检查，错误会给出具体节点。[修复前](production/import-before.json) · [修复后](production/import-after.json)

独立复产可使用[接收方双房输入](receiver/receiver-input.json)。将它复制到可写副本根目录，安装锁定依赖后执行下列命令。新房间结果写入 `phone-rooms-fifth`。同一批次的[错误输入](receiver/receiver-invalid.json)将开关写成字符串，可用来检查拒绝原因和原结果保留。

```powershell
Push-Location source
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-phone-static-v1/examples/compact-cradle-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-phone-static-v1/examples/compact-cradle-v2.json
Pop-Location
node source/scripts/company-platform/batch.mjs receiver-input.json phone-rooms-fifth
```

本次验证覆盖桌面静置、开关屏幕、组合布置和存档恢复。录像在 Chromium 软件渲染下以正常速度录制。真实推流、角色手持和目标电脑帧率均未实测。
