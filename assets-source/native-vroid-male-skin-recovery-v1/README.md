# 男性原生卸 Tops 与皮肤来源

一次后台 Bridge 原生闭环已完成，结果支持后续将原生恢复 PNG 复用到原男性完整79骨源。当前包只取得并核对 donor，尚未制作该合成基体、独立装备或 factory。

## 原生过程与恢复

初始 status 确认为 Bridge0.15.0、ready=true、dirty=false，当前文件精确为既有 `skin-mask-recovery/generated/male-before-skin-study.vroid`。保存独立 entry checkpoint 后，打开固定 c936b 男性可编辑源，fresh `vroid_list_groups` 得到实际 Tops ID，保存独立源副本，卸下该唯一 Tops，另存、原生导出 VRM1。delete_transparent=false，减面/贴图缩减/平滑沿已验女性参数均0，没有改源 meta 的授权字段。

结果保存后退出、冷开，同组表完全一致；最后恢复进入时原文件，status ready=true/dirty=false。原 c936b 和进入时文件 SHA 均未改变。没有桌面输入、另启 Studio、其他版本、GPU、public 或运行时代码变更。导出窗口已释放。18个实际请求/返回及原始stdout/stderr在对应 evidence 目录，客户端复用原 `vroid-bridge-study-v1/call.py`。

`native-selection.json` 保 fresh male Tops ID，未复制女性ID。`.vroid` 每次另存可能改变容器字节，checkpoint以本次实际SHA记录，不冒称等于原源字节。

## 输入与产物

- 原男性 VRM `a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da`，13,395,084B。
- 原可编辑 `.vroid` `c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a`，4,514,004B。
- 原生卸Tops `.vroid` `2ae919989e43f68b05e2c0813408910511d22027ddeb604d3ae88a9ad5660cb6`，4,314,893B。
- 原生卸Tops VRM `dc7cf29714793106f3bdb01c5f44284af1b248c6046eb453e08fa5d78e60c84c`，13,049,412B。
- 原样提取的 PNG `cfd1860d2d6c04e33b5636c029dac535a69e35eacf30f6f4d66729a4fc2e1368`，799,144B，2048×2048。base/shade使用同一图，未绘制或修改像素。

源与 donor meta 的 onlyAuthor/personalNonProfit/noRedistribution/modification prohibited 等字段保持原值，只作作者内部技术样件。未声称商业、分发或任意修改权限已审。

## 实际CPU对照

原Body10022面、Bottoms1624面、Shoes712面都取得精确几何+UV三角对应，source-only/result-only为0。引用的 POSITION/NORMAL/UV/WEIGHTS 完全相同，正权重骨名语义一致，rest skin 点差0。JOINTS数值随骨表缩小变化，未据此声称数组相同。

卸Tops后91→61节点，79→59蒙皮骨。20个消失skin joint是Tops辅助骨，另10个消失节点是原生spring端点；其完整名字在 `evidence/native-vroid-male-skin-recovery-v1/raw-node-architecture.json`。共同骨local TRS、world rest及IBM精确不变，无换父级；保留Body/Bottoms/Shoes没有正权重引用删除骨。源Tops仍需要这些辅助骨，故后续应保留原79骨及原spring合同，仅复用原生PNG，不将59骨donor直接冒充完整换衣基体。

70154个双线性七点Body样点，原11118个低于alpha .5，donor为0；新隐藏0，所有样点RGB差0。全图原/新同时可见像素RGB差0，alpha增加608383像素、无减少。读回使用原MASK .5、原UV与repeat/linear sampler。nearest前置与此次bilinear计数略不同，保各自定义。七点采样不能证明所有GPU raster/mip或每个解剖区域可见，不能把无低alpha采样直接写成完整身体验收。

原CPU脚本首次有一个括号SyntaxError，解析阶段尚未读回/写产物；失败脚本快照保留，修正后CPU成功，未重复原生闭环。

## 复用与边界

后续可参数化女性 `native-vroid-unmasked-base-v1/build.py` 的原PNG追加方法，将此原生PNG接到原a18a，保91节点/79骨、所有原accessor/材质/UV/图片其余字节，并重新做男性衣物绑定、coverage与factory检查。当前只是该步骤的来源依据，没有进行合成或继承女性/旧男性运行结果。

可审阅 `native_cycle.py` 和18个已保存请求理解复现，但本目录输出拒绝覆盖，不应直接再次调用原生脚本。重新试验必须取得独占窗口、核ready/dirty/当前文件，改用新唯一输出目录及新身份；本次一次原生预算已用完。CPU readback入口也拒绝已有输出，保留的数组/JSON足以独立复核当前结果，无需重跑Studio。
