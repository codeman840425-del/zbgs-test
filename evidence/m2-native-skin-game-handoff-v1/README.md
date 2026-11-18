# 原生暖肤色进入独立游戏包

固定源码 `4f43b6aa72442e7f52ee81bfec9b90b694bdfb98`，构建 `436562eeac4a`。独立检出执行 `npm run build` 后，游戏入口可达的 11 个运行文件与固定构建逐字节一致。复核文件为 `scripts/runtime-package/game-record-production-skin-reviewed.json`，上一虹膜构建仍可生成清单。

两份输入来自上一轮保存的 `green.json`。D02 为每份记录执行同一项 `appearance.skinTone=native-warm-v1`。圆度 A 从第 3 版更新到第 4 版，面颊 B 从第 2 版更新到第 3 版。身份、来源、绿虹膜、后发适配、服装、材质和道具保持一致。输入与产出文件 SHA256、角色记录 SHA256 以及肤色资源身份见 [记录比较](record-diff.json)。

独立交付位于 `experiments/m2-native-skin-game-handoff-v1`。从该目录启动本地静态服务后打开 `record-consumer.html?records=/records/manifest.json`。包内有 57 个清单条目与一份 `runtime-package.json`。清单 SHA256 为 `1f146132c92e220651dca08db43b6a4d6e631bae35d55f74a9c714d2bd2dd4f5`。

Chrome 157 在开发机上显示两位角色同时持麦讲话。按原速录制 8.502 秒，解码 256 帧。关闭页面并重新打开后，两个实例分别获得新根节点，读回的配方、装备材质、道具、后发及记录身份均一致。重复的请求参数与畸形清单均被拒绝，两个失败路径都没有回退到内置记录。检查期间没有页面异常、失败资源响应或跨源请求。

- [浏览器回读报告](browser/report.json)
- [双角色原速录像](browser/produced-pair-1x.webm)
- [双角色截图](browser/produced-pair.png)
- [录像测量](browser/media-report.json)
- [两份完整记录](records.json)
- [独立包清单](inventory.json)

游戏读取页仍显示旧的“四份固定人物记录”说明，本次实际加载两份外部角色，第二组按钮隐藏。开发机证据覆盖独立包读取、同场讲话和关闭恢复。普通电脑性能及最终观感待验。
