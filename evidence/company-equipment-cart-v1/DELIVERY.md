# 四款直播器材推车

固定源码 `014392c88d7538855872a6c799f1e4e26486606d`，查看器 `3ab00ef8132d`，移交清单 SHA-256 为 `f7114402c8ab29196e2e6ac7bb288cdc08c340337c2fca94b1f1c7e5a091e6b6`。正式包归入本机 [deliveries/equipment-cart-v1](../../company-workspace/deliveries/equipment-cart-v1/README.md)，归档后逐份校验 2,292 个文件。[版本与输入摘要](handoff.json)

工作室和出租屋使用同一套开放车、航空箱车、抽屉工具车和斜撑展示车。上、下两层都能安装相机和音频设备。编辑房间时可将相机从桌面移到推车，选择层板后更换车身，移动、转向或复制整车。关闭重开后，复制出来的设备仍属于自己的推车。两种错误摆法分别指出车身跨墙和门口被堵，并保留原存档。[四款车身](four-structures.png) · [两房界面验收](browser/report.json) · [原速录像，15.84 秒](browser/equipment-cart-1x.webm)

接收方按锁文件离线安装并重建，639 个查看器文件逐字节一致。接收方用同一份源模型把开放车层板从 25 毫米改为 32 毫米，以新版本发布，在冷开存档里分别测得上下设备与层板的接触。独立复产使用清单 `8f37ca30…`；最终包与它逐项比对，唯一改动是浏览器检查脚本归档录像的步骤。该脚本已在最终包上原样复跑，396 帧全部解码。[独立接收回执](independent-rebuild.json) · [实物安装与失败检查](room-checks.json) · [录像解码](browser/video-decoding.json)

在正式包根运行第一条命令验收原件。下面的制作命令在独立工作副本的 `source` 目录运行，`output/cart-check` 选用新的过程目录。

```powershell
node verify.mjs . f7114402c8ab29196e2e6ac7bb288cdc08c340337c2fca94b1f1c7e5a091e6b6
```

```powershell
npm ci --prefix prototype
node scripts/company-platform/build-equipment-carts.mjs --check
node scripts/company-platform/test-equipment-cart-rooms.mjs output/cart-check
```

完整编辑器复跑使用 `node scripts/company-platform/qa-equipment-cart.cjs <正式包路径> <完整清单SHA256> <新过程目录>`。录像使用软件 WebGL。验证覆盖布局编辑和保存；游戏内角色推车及普通电脑帧率尚未实测。源模型和四种可编辑车身归入[制作说明](../../assets-source/company-equipment-cart-v1/README.md)。
