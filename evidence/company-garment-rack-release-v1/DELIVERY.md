# 更衣区的双挂位衣架

[固定包](../../company-workspace/deliveries/garment-rack-v1/README.md)包含整套出租屋的开播准备间和整租平层的造型间。两间房都能独立更换架子和每件挂衣。48.60 秒的原速录像展示四组更换、移到空挂位、补挂、进入第二间房。[原速录像](browser/video/garment-rack-rooms-normal.webm) · [录像抽帧](browser/video-review.png) · [出租屋](browser/rental.png) · [整租平层](browser/floor.png)

| 版本 | 构建 | 清单 SHA-256 | 核对文件 |
| --- | --- | --- | ---: |
| 固定源码 `3c9630cdd6db0a19b8da100b3a41d90c68a261fc` | `161d598f74da` | `d3502382d59ac3fbfa4036a47ed811f163e4fc549ed6c9b27af755dd8e2406f2` | 1986 |
| 接收方独立制作的斜襟上衣房间包 | `0ae928977a8b` | `1f013e87323dc7e1b9c940aab57de192793e49c2cee354d666a671a1053eab09` | 1995 |

门式、A 形、悬臂、木脚四款开放衣架共用两处实杆挂位。夹克、衬衫、连衣裙和连帽衫各有自己的衣钩、衣撑和裁片。同一架上的两件衣服可以分别移除、补挂和换位。相同挂位被两件衣物占用时会拒绝操作，合法的整架移动与旋转则带动两件衣物。32 种架、衣与挂位组合通过几何回读。两间房各按四组造型保存，并逐次关闭重开。[挂钩近照](browser/hooks.png) · [几何测量](production/meshes.json) · [房间和事务](production/rooms.json) · [固定浏览器回执](browser/report.json)

首轮连衣裙在腰部和裙摆出现亮缝。更换三角细分方式并将饰边贴回布面后，新旧同机位画面能直接比较。另有一处离线预检曾跳过没有桌子的房间。独立接收副本将挂衣文件换成衣架几何，同时更新声明的哈希和字节数。验证、换款和打包均拒绝错误角色的模型，原场景和已保存文件的字节保持一致。[布面修复前后](production/cloth-before-after.png) · [布面测量](production/cloth-repair.json) · [无桌房间回执](receiver/offline-edit.json)

## 接收方制作第五款

接收方从可编辑裁片和图案脚本生产斜襟上衣，修改领口饰边，将原创 64 × 96 人字纹嵌入 GLB，登记新资源并替换出租屋左挂位。整租平层的输入、布局、存档逐字节保持。浏览器冷开后恢复了同一件衣和布纹。分别用独立安装的依赖重建固定包和派生包，575 和 577 个运行文件全部与各自的查看器逐字节相同。[新上衣实景](receiver/print-restored.png) · [制作者输入](receiver/source/tunic.json) · [浏览器实测](receiver/browser.json) · [独立重建](receiver/rebuild.json) · [派生包](../../company-workspace/production-trials/garment-rack-receiver-v1/printed-tunic/README.md)

## 复跑

在固定包根目录运行，打开打印出的地址，用 `?delivery=wardrobe-rental` 或 `?delivery=wardrobe-floor` 选房。

```powershell
node verify.mjs . d3502382d59ac3fbfa4036a47ed811f163e4fc549ed6c9b27af755dd8e2406f2
node serve.mjs 0
```

在接收方可写副本的 `source` 目录安装依赖，然后验证及生成两个房间。输出目录由接收方选定。

```powershell
npm ci --prefix prototype
node scripts/company-platform/build-garment-rack.mjs --check
node scripts/company-platform/test-garment-rack-assets.mjs ../mesh-check
node scripts/company-platform/test-garment-rack-rooms.mjs
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/garment-rack-rooms.json ../my-rooms
```

要复产第五款，在同一工作目录将本回执 `receiver/source/` 下的 `weave.py`、`LICENSE.txt` 和 `tunic.json` 放到 `assets-source/company-receiver-tunic/`，并将 `rooms.json` 放到可写副本根目录的 `my-input.json`。图案脚本使用 Python 标准库。

```powershell
python assets-source/company-receiver-tunic/weave.py
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-receiver-tunic/tunic.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-receiver-tunic/tunic.json
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs ../my-input.json ../new-rooms
```

本次验收覆盖静态陈列挂衣。预览使用软件渲染。带门衣柜的开启范围、真实角色穿戴和最终游戏联调各有独立验收。[制作规格](../../docs/research/COMPANY-GARMENT-RACK-PRODUCTION.md) · [完整固定身份](identity.json)
