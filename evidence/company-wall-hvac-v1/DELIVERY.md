# 壁挂空调双房交付

查看器构建 `76cbd909ffd6`。四款外观、两份房间配置和运行代码固定于 `24015b0e4fb0ba9c7401ffed0de996c31cb5010b`。移交源码 `23c3af3cdbf9abf2ab2f141f8738fc45d5a96d0c` 补入独立接收工具，并修正浏览器验收工具的输出路径断言。两次固定检出构建均为同一查看器。本机在 `company-workspace/deliveries/wall-hvac-v1` 保存正式移交包，清单 SHA-256 为 `8b06e1570110945e7fee75f1e77d760aa2a1b5db4f74304955a5b4066011c466`。候选目录移至正式目录前后均验齐 2250 项。

民房和旋转出租屋各有一台壁挂空调，可在房间里原位换款。实际操作可用“聚焦”看机身、导风口和指示灯，用电源按钮和“空调模式”切换状态。在移交目录执行 `node serve.mjs`，沿打印的地址分别使用查询参数 `?delivery=wall-hvac-home` 和 `?delivery=wall-hvac-rental` 查看两房。[四款房内画面](browser/four-looks-room.png) · [42.6 秒原速录像](browser/video/wall-hvac-normal-1x.webm) · [录像解码与重试记录](browser/video-validation.json)

| 验收 | 观察结果 |
| --- | --- |
| 制作与登记 | 源模型经适配后生成弧面、双舱、纵肋与阶肩四种实际网格。四个 GLB、四份侧车和一份集合清单可逐字节复产，原有 298 个资源记录相同，正式目录增至 302 项。[造型和来源](production.json) · [另一个源码副本复产](source-rebuild.json) |
| 两房安装与保存 | 普通新增把设备装到 2.24 米，背板贴墙。两房逐款切换，8 次冷恢复通过。坏模型、同墙包络重叠、非法脱墙和不兼容外观在两房均被拒绝，旧保存可继续读。[双房数据](rooms.json) |
| 预览操作 | 在房间实际点选外观、电源、送风、制冷与制热。检查了同视角导风口与发光窗的画面变化。两房关闭浏览器后均从原保存恢复。[固定浏览器](browser/fixed.json) · [移交包浏览器](browser/independent.json) |
| 独立制作 | 接收方从空依赖缓存运行 npm ci，查看器 629 个文件逐字节重建。第五款每组纵肋从 7 根改为 10 根，仅替换出租屋的空调。民房的 7 个文件逐字节一致。登记前被拒的同一操作登记后重试成功。[接收回执](receiver/report.json) · [重建核对](receiver/viewer-rebuild.json) |

## 复跑

在移交包根目录执行首行。源码命令在该包的独立工作副本 `source` 下执行，`prototype` 依赖使用包内锁文件安装，输出选用全新工作目录。接收方完整验证命令可在回执的 `commands` 中逐项核对。

```text
node verify.mjs . 8b06e1570110945e7fee75f1e77d760aa2a1b5db4f74304955a5b4066011c466
node scripts/company-platform/build-wall-hvac.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-wall-hvac.mjs output/hvac-room-check
node scripts/company-platform/qa-wall-hvac.cjs PACKAGE_ROOT 76cbd909ffd6 FRESH_OUTPUT --record
```

录像为软件渲染，导风板根据保存的模式即时改变角度。实测范围为室内高位壁挂设备的制作、安装、状态与外观。真实温度、风场、角色行为和普通电脑帧率均未测。
