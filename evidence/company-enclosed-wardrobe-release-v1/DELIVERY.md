# 双门更衣柜与两间造型房

打开[28.80 秒原速录像](browser/video/enclosed-wardrobe-normal.webm)可看到四款衣柜连续换面、两扇门分别开启，以及两间更衣房中的挂衣。出租屋配落地镜，平层配梳妆台。房间保留单件挂衣的稳定身份、所属挂位和每扇门的开度。[出租屋](browser/rental.png) · [平层](browser/floor.png) · [两房浏览器回执](browser/report.json)

四款衣柜复用 Kenney CC0 原件的实木门、框芯门、凹嵌门和玻璃门。双房各验四次浏览器冷开。玻璃测试中，在门窗后移动挂衣时，1,402 个受测衣物像素均能透过玻璃反映变化。屏风仅挡左门时，右门仍能全开；位于运动中段的 6 毫米薄障碍物会阻止该门从任一方向通过。临界擦边按保守包络判断。观测使用软件渲染。角色实际换装、使用动作和目标电脑性能另行验证。[实物网格](production/wardrobe-assets.json) · [运动及保旧](production/rooms.json) · [隐藏楼层坏件](production/hidden-floor.json)

## 给接收方

融合组用固定母包独立制成青木铜脊柜门，出租屋冷开后左右门分别保持 0.70 和 0.60 的开度，平层六个原文件逐字节保留。两种实体试件共做 72 次事务，20 次预期拒绝均保留原场景。母包和派生包分别从源码重建出 583 和 585 个一致的查看器文件。[融合组 ENV-012 回执与原件哈希](fusion-receipt.json)

| | 固定交付 | 接收方百叶款 |
|---|---|---|
| 构建 | `cf3ae4f79ed0` | `e2abe6e9083f` |
| 净包核对 | 2022/2022 | 2031/2031 |
| 重建后字节一致的查看器文件 | 583/583 | 585/585 |
| 可用目录 | [正式包](../../company-workspace/deliveries/enclosed-wardrobe-v1/README.md) | [接收方再交付包](../../company-workspace/production-trials/enclosed-wardrobe-receiver-v1/louvered-ash/README.md) |

源提交为 `b825f25d521f60fdd44573a2ff5e94e17306acec`。房间键为 `closet-rental` 和 `closet-floor`。可复用检出随工作包轮换，正式包保留该版本的源码、查看器、素材及许可。[固定身份和逐项哈希](identity.json)

接收方用随包的原始柜门和可编辑 Python 原稿生产第五款，两扇门各有六条实体百叶。出租屋柜面替换后，左右门和两件旧挂衣均可恢复。平层原玻璃柜的输入、布局、存档保持原字节。[百叶近照](receiver/louvered-detail.png) · [打开后的房间](receiver/louvered-open.png) · [复产](receiver/rebuild.json) · [冷开](receiver/browser.json)

在场景平台主目录运行下列命令，可核对正式包并用新的试制目录重建第五款。复跑使用 Python 标准库、Node.js、包内的依赖锁，以及已准备好的 npm 离线缓存。浏览器验证还使用项目锁定的 Playwright 和 Chromium。

```powershell
$e = 'evidence/company-enclosed-wardrobe-release-v1'
$pkg = 'company-workspace/deliveries/enclosed-wardrobe-v1'
$pin = '2378ce87f64d1efe1f98d9c311fcd15e197fad427634ad35bce632cff5cc6953'
node "$pkg/verify.mjs" $pkg $pin
python "$e/receiver/receive.py" --candidate $pkg --manifest $pin --art "$e/receiver/source" --trial company-workspace/production-trials/enclosed-wardrobe-replay --out output/enclosed-wardrobe-replay
node scripts/company-platform/qa-enclosed-wardrobe-rooms.cjs $pkg cf3ae4f79ed0 output/enclosed-wardrobe-replay/browser --record
node "$e/receiver/qa-louvered-wardrobe.cjs" company-workspace/production-trials/enclosed-wardrobe-replay/louvered-ash e2abe6e9083f output/enclosed-wardrobe-replay/receiver-browser prototype $pkg
```

[原速录像采样与校验值](browser/video-review.json) · [制作参数与接入说明](../../docs/research/COMPANY-ENCLOSED-WARDROBE-PRODUCTION.md)
