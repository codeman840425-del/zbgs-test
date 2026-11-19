# 可再次生产的食品带货直播间

[14.32 秒原速录像](browser/video/showcase-rooms-normal.webm)依次展示立装袋、纸盒、金属罐、蜂蜜瓶，以及整架转向后的三层货样。出租屋和工作室使用相同四款商品、不同背景和摆位。柜台、三层货架、相机桌和补光系统均可独立编辑。[出租屋实景](browser/rental.png) · [工作室实景](browser/studio.png) · [原速录像抽帧](browser/video-review.png)

接收方从可编辑原稿制作燕麦可可纸盒，修改盒型并绘制自己的包装正面，再由同一发布器登记。出租屋仅替换当期主商品，工作室的原布局与四个批次文件保持原字节。浏览器中可将燕麦盒换成罐头，再换回并保存。重启后仍能读到盒面的 SUNFIELD、OAT 和 COCOA。[重开后的包装近照](receiver/printed-front-restored.png) · [原始图案](receiver-art/carton-label.png) · [可编辑原稿](receiver-art/make_carton.py) · [独立浏览器回执](receiver/browser.json)

| 交付 | 构建 | 校验的净包文件 | 独立离线重建的查看器文件 |
|---|---|---:|---:|
| [两房正式包](../../company-workspace/deliveries/product-showcase-v1/README.md) | `e6a81ca8eda3` | 2058/2058 | 591/591 |
| [接收方再交付包](../../company-workspace/production-trials/product-showcase-receiver-v1/printed-carton/README.md) | `672a5b9514b2` | 2063/2063 | 593/593 |

正式源码为 `f11e805688728d37b3d5b1588ea3c0d9e8246897`。首批四件使用 Kenney Food Kit 的原网格、真实 UV 和嵌入色卡。两个房间各验证四款替换及完整浏览器重启。[制作说明与原作许可](../../docs/research/COMPANY-PRODUCT-SHOWCASE-PRODUCTION.md) · [生产检查](production/products.json) · [双房浏览器回执](browser/report.json) · [完整哈希和路径](identity.json)

批量生成、独立编辑和正式打包均复核已声明的带货站位。从实体相机镜头采样五条到主商品的视线，并测量入口、主播所需空间和实际支承面。出租屋的蜂蜜瓶向台前移了 8 厘米才避开柜台遮挡。占错层板、挡镜及侵占入口均可定位。在其中一房使用错误配方，另一房和原存档保持有效。[出租屋实测](production/showcase-rental.json) · [工作室实测](production/showcase-studio.json) · [拒绝与单份重试](production/blocked-counter-retry.json)

## 复跑与接收

在场景平台主目录运行下列命令。为独立复产选择新的试制目录和回执目录。接收脚本使用 Python 3、包内 Node 依赖锁和本机 npm 离线缓存。重放浏览器检查需项目锁定的 Playwright 与 Chromium。交付源码内的制作、批量生成与编辑命令见上方制作说明。

```powershell
$e = (Resolve-Path 'evidence/company-product-showcase-release-v1').Path
$pkg = 'company-workspace/deliveries/product-showcase-v1'
$trial = 'company-workspace/production-trials/showcase-replay'
$pin = '0a7c5e79948f132b9c196f36cbc4a15c0d220c213f7745e46e062c5c5d146c65'
node "$pkg/verify.mjs" $pkg $pin
$env:RECEIVER_ART_DIR = "$e/receiver-art"
$env:RECEIVER_EVIDENCE_DIR = "$PWD/output/showcase-replay"
New-Item -ItemType Directory -Path $env:RECEIVER_EVIDENCE_DIR -Force | Out-Null
node "$e/receiver/receive.mjs" mother $pkg $trial $pin
node "$e/receiver/receive.mjs" derive $trial
node "$e/receiver/receive.mjs" rebuild $trial
node scripts/company-platform/qa-product-showcase-rooms.cjs $pkg e6a81ca8eda3 output/showcase-replay/stock-browser --record
node "$e/receiver/qa-printed-carton.cjs" "$trial/printed-carton" 672a5b9514b2 $pkg prototype output/showcase-replay/printed-browser
```

编辑器存档与规范化交付存档的 JSON 字段顺序可以不同。独立重建分别核对编辑输出、交付编码和完整布局内容。[编码比对](receiver/save-encoding.json) · [收件与坏原稿检查](receiver/rebuild.json)

本包验证静态实物、两种带货布置和软件渲染画面。角色实时入位、展示动作、动态遮挡及普通电脑性能仍需后续验收。
