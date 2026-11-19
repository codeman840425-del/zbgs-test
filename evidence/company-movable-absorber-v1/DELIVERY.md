# 唱播间和带货出租屋的移动吸声屏

四种可换外观分别为折屏、脚轮屏、双面凸毡屏和弧形屏。四款均为宽 1.20 米、高 1.80 米、含脚深 0.38 米的落地设施。房间配置可指定资源版本、位置和朝向。普通物品面板可以原位换款、旋转、移动和保存。[制作参数、素材来源与复跑命令](../../assets-source/company-movable-absorber-v1/README.md)

| 可以观看的结果 | 证据 |
| --- | --- |
| 独立唱播间正斜视四款，调整位置、试挡门并保存 | [17.68 秒原速录像](browser/absorber-studio-normal.webm) |
| 带货出租屋从侧面看板身与脚部占地，切换四款并保存 | [17.84 秒原速录像](browser/absorber-rental-normal.webm) |
| 接收方将三叶折屏原位换成四叶，关闭浏览器后恢复 | [唱播间四叶实物](receiver/absorber-studio/absorber-studio-restored-absorber-folding-v2.png) · [出租屋四叶实物](receiver/absorber-rental/absorber-rental-restored-absorber-folding-v2.png) |

**实物与摆放。** 四款使用项目原有毡块、钢支脚或具有来源记录的实轮。门口反例中，屏身离入口预留区还有 79.75 毫米，右脚已有 10 个三角面侵入，移动被拒。靠窗正例中，同一支脚伸到窗下，上部屏体与窗框仍有 19.75 毫米净距，摆放通过。八次非法编辑保持原存档，两房经旋转、复制和冷开保持资源及变换，未显示的另一楼层也经过独立检查。唱播间保留原麦位与镜头条件，出租屋保留原商品出镜与座位通路。[房间实测](rooms.json) · [固定浏览器报告](browser/report.json)

**接入缺口与修复。** 初版按三角面的高度区间判断承托，误收了四种反例，其中包含与屏体水平相隔 70 毫米的支脚。现在按可见实体的实际接触检查承托和厚度。四款初版、四叶新版及合并到一个无名网格的真品通过，九个悬浮、虚假支脚或薄图等反例被拒。[修复前](geometry-before.json) · [固定源码复测](geometry.json)

**独立移交。** 固定源码 `5f5af6d0c884919141aff1e6f1f1a6984d655360`，构建 `30fd28eef82a`。归档后 2,549 个文件与清单一致。接收方用空 npm 缓存和锁定的依赖重建，697 个查看器文件逐字节一致，两个原房间的输入、布局、存档和报告也逐份一致。[固定版本](identity.json) · [封包校验](sealed-package.json) · [接收命令与回执](receiver/receipt.json)

接收方使用包内四叶示例，通过公开生产命令生成 `absorber-folding@2`，保留 `@1`。其派生构建为 `948686fc73e5`。同一实例在两份房间先载入三叶，选择四叶并保存，彻底关闭浏览器后从用户存档恢复。派生包的 2,554 个文件均通过清单校验。[接收方双房输入](receiver/two-rooms.json) · [唱播间恢复报告](receiver/absorber-studio/report.json) · [出租屋恢复报告](receiver/absorber-rental/report.json)

在本机的 `company-workspace/deliveries/movable-absorber-screen-v1` 目录运行 `node serve.mjs`，按打印地址选择 `?delivery=absorber-studio` 或 `?delivery=absorber-rental`。两个录像均为 1600×900、25 fps、1 倍速。验收使用软件渲染。屏体以固定展开姿态布置，声学效果和轮轴运动不在能力范围内。普通电脑性能、真实角色通行和最终联调仍待验证。[录像逐帧核验](browser/recording-probe.json)
