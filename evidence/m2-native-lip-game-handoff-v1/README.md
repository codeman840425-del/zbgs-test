# 两份 FaceContour 唇妆记录的独立游戏包

固定源码 `1b1d6189c92a125b242ca57a17aadc6884c05678`，构建 `637b3f8bb4a3`。在独立干净检出重建后，游戏入口可达的 11 个运行文件与固定构建逐字节一致。独立复核登记为 `scripts/runtime-package/game-record-production-lip-reviewed.json`。上一暖肤固定构建仍可生成原 57 文件清单，文件字节与旧验证一致。游戏打包器的八项回归通过。

一次 D02 批量编辑同时使用两份已有记录。圆脸 A 保持原肤，脸颊 B 保持暖肤，二者均保留绿色虹膜、眼镜、麦克风、原装备、后发动态和两项独立身份。共用编辑为 `lipColor=native-lip-101-v1`。两份角色的修订均从 3 到 4。工作台原始候选的准入状态沿用已有登记。

从 `records.json` 直接生成 55 项资源清单，另附一份包清单，共 56 个文件。复核了每项实际发布字节。独立游戏包位于 `experiments/m2-native-lip-game-handoff-v1`，静态服务入口为 `record-consumer.html?records=/records/manifest.json`。包清单 SHA256 为 `9b4fc030719efce5549eee3e6f0feb52e4711753d566aa33c63151174414158b`。

Chrome 157 开发机实际从独立包还原两人并同时播放讲话。关闭页面重开后两份记录再次完整恢复，角色根节点均更新。重复清单参数、错误散列均触发拒绝。没有失败的资源响应、页面异常或跨源请求。1 倍速 VP9 录像解码 255 帧，首末帧相距 8.469 秒。

[双角色原速录像](browser/produced-pair-1x.webm) · [游戏页面截图](browser/produced-pair.png) · [浏览器核验](browser/report.json) · [逐条记录差分](record-diff.json)

精确源收集了两位角色所选资源和实际唇妆底图。静态预算两个记录均为 over-budget，合计 130,868 个放置三角形、108 个纹理对象、617,269,936 字节 RGBA8 含 mip 估计。普通机性能及最终观感仍待验。[预算输入](budget-input.json) · [预算结果](budget-result.json)
