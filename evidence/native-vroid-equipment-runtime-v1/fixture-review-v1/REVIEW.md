# 原生装备渲染夹具短审

v4已核到固定源码，当前只读CPU范围内无新增启动阻断。没有重新运行浏览器、编辑器、GPU或作者prepare。

同pose对照使用同一个候选VRM的raw骨架，两个截图间只切原服装与独立装备可见性，没有中间motion step。VRM原materials数组与独立GLTF材质实例分离，每次step各自更新一次，未发现双推进。候选78912、三个GLB、manifest及固定eae/d0f9身份由请求与实际字节绑定，不是原房间027模型的正式profile接入。

新clock用首RAF自身时间建立epoch，首dt为0，其后严格检查单调与finite并从毫秒转换为秒。独立CPU从capture提取实际函数，复现首RAF早于调度时performance.now的场景，得到首0、后0.016，且函数SHA与浏览器注入pin相同。15个runtime source与5个资源pin也逐项吻合。没有重复作者300次material.update smoke。

CSS增加text/css，作者实际fetch回执已pin。浏览器端stylesheet加载与canvas CSS尺寸门存在，但本独审没有测浏览器布局。原v1/v2/v3失败保持，不将已修负dt/CSS再记新缺陷。

本审发现旧observe遇NaN会静默保留0最大误差，已保存真实Three反例。v4现对两点及距离finite显式拒绝，阻断已修。该反例不表示旧影片实际含NaN。

Playwright整片含加载、暂停对照、瞬时采样和reset，不能将整文件都描述为纯正常速。只有clips实时段可在实际raw/applied累计时钟读回后作正常速说明，50ms cap导致的时间损失须保留。作者已确认会明确此范围。实际v4视觉、录像、全factory、导航及普通机性能均未由本次CPU审查验证。
