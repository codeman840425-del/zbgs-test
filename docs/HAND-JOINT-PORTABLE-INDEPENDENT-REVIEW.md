# 手部关节包络 portable：独立集成审查

2026-11-14。只读源码、原 VRM 二进制/JSON 和配置，运行已有纯 Node schema 检查；没有浏览器、产品改动或新性能测量。

结论：**当前精确三体配置未发现必须先修的运行时阻断，可进入共享 abdb 的独立固定候选集成；不等于集成通过。** 08e4 的三体皮肤结果与 44cd 的成本/影片不能直接继承为完整 abdb 结果。

精确输入及逐文件核查见 `evidence/hand-joint-portable-independent-review.json`。本次 helper SHA `4404e6eb0b0ab2b3c89e90b8f511d83940bbfeff25d1629252683b44e5b555d9`；motion candidate `bc1534d75d15bb88e6abb99d9691ecf8af617d97dea9f55fac15e8e8f0620825`。profile pins 及三份 candidate/base raw SHA 均与 portable manifest 实际文件相符。

## 已核实的边界

1. **资源身份和失败关闭。** `foundation-avatar.js.candidate` 先核 body 字节 SHA，再下载 profile，核字节 SHA、bodySHA/schema，完成后才解析 glTF。下载/哈希/schema失败会拒绝加载，没有悄悄退回旧手检测。失败发生在 glTF/材质创建之前，不增加这一路的 GPU 清理缺口。`?handSkin=legacy` 仅选择算法，仍先加载并校验配置资源；不是缺失资源恢复模式。无配置的男性保持旧路径，不额外请求手 profile。
2. **真实骨语义/逆绑定。** 三体各 32 个 semantic 与 sourceNode 均唯一；逐项按 VRM0 ThumbProximal/Intermediate → 当前 ThumbMetacarpal/Proximal 的实际映射对回原 VRM，32 项全部匹配，且都位于正确左右手子树。配置内 inverseBind 与原 VRM float32 解码值最大差 0。没有使用 female 的 bodySHA 偷换派生体身份。
3. **schema 范围。** 现验证器要求精确 body、metres、32 个不重复语义、侧别、有限正半径/有序轴向端点及正交单位轴。既有纯 Node 三体各 1 正例+8 负例全部通过。它不是任意外部 profile 的完整验证器：例如 sourceFaces 诊断数组、实际 raw 节点彼此唯一性由当前受 hash 固定的资源/本次离线审查保证，不是通用运行时契约。当前三份数据完整，不构成现有加载阻断；新增来源不能仅复用此正例结论。
4. **更新顺序。** `fitSeatHands` 调用现有 `seatHandSurfaces(true)`，先将当前 normalized pose 同步 raw 并更新裙面，再 `refresh()` 将关节局部包络经 raw matrixWorld 变到世界。`project()` 固定当次源形状，`railsAt()` 只按候选 wrist 世界位移平移，原 solver 最后保持手的世界旋转。左右分别持有 origin/base/shifted 数组；处理左臂不会重采右臂为修正后左姿态。
5. **代理不是真实蒙皮。** 保持手世界旋转与手指 local 动作，使手骨子树刚性部分的平移预测合理；腕边混合到前臂的皮肤不因此获得刚体保证。三配置均有 `maxForeignWeight=1`，最大截面半径约 43.99mm。80 条有限纵轨/手和五个端点不是连续实体/端帽碰撞。补丁明确把 clearance 标成 predicted raw-bone envelope；最终 actual skin gate 必须另测，不能用 remainingClearance 自证。
6. **实例隔离。** helper 没有模块级可变缓存；states/bindings/Vector3 都在工厂闭包。每实例 loader 独立 JSON.parse 与 VRM 解析，profile 配置保持现有 structuredClone 路径。helper只读配置，不写绑定/源材质；没有添加定时器、事件监听或 GPU 资源。motion/actor释放后这些闭包可回收。源码没发现两实例共用 shifted rails 或骨引用的路径；新固定版双实例仍需实际验证。
7. **成本上限和范围。** 每次有效刷新为 32 个关节矩阵变换，不再逐帧读取 1538 个手顶点。每手 80 轨，现 solver 至多 5 次迭代加最终复核，因此每 fit 调用至多 960 条新增手轨查询；每查询的候选三角数仍由裙拓扑和空间索引决定。32 次临时 axis 向量及若干小数组仍存在，不能称零分配。角色数量、模拟子步和 seated/idle duty 会放大成本；44cd 单角色成本不能推出普通设备或多实例达标。`handNarrowPhasePairs`实际计数是 rail query 次数，非真实 triangle-pair 数，后者是 measurement.testedTriangles。

## abdb 增量的保留与实际测试缺口

portable diff 相对于当前共享 abdb 只有三处文件的局部手相关改动：追加 loader/profile，替换手代理及准确计时标签；没有移除 forearm 专属 profile、材质 recipe API、greetingReady 条件或改写动作时长/求解阈值。main/live/material/equipment 等不在补丁内，必须留在共享版本，不能拿隔离工程整目录覆盖。

实际隔离工程与共享版不同：main、live-presentation、equipment、m1-equipment 的字节 SHA 不同，隔离工程没有 material-recipes.js / cloth-material.js；隔离 foundation-avatar/profiles 也不等于 portable candidate。只有 motion candidate 与隔离当前 motion 完全相同。因此 08e4 三体 skin0 是算法/配置证据，不是共享集成证据。

现有主链顺序仍是 motion/fitSeatHands → livePresentation.preUpdate → VRM update → livePresentation.postUpdate → garment bookkeeping。持麦和招手层可能在手求解后覆盖腕姿；这是既有明确的接触指标阶段边界，本补丁没有改顺序。**必须在新固定版验证招手/持麦所需组合，不能把坐入/起身的 skin0 扩大到这些动作。** 材质 recipe 换材质会触发现有 WeakMap 新 key，当前 recipe 没有原地改同一个 map 的 alpha；新包络不引入另一份纹理 alpha 缓存。将来原地修改纹理时仍需失效策略，当前不新造该需求。

建议固定后做 root 已安排的小范围集成检查：三体 actual/legacy 接触、greetingReady 四例及招手/卸麦边界、材质切换/还原、实例隔离与加载失败清理；随后同版坐起正常播放和成本。保持所有原门槛。

审查期间 QA 已补 README 顶部：当前 08 三体 pins/加载方式与旧 44 静态单女方案明确分开，旧 helper `fe0733…` 为历史，当前 `4404…`。`portable/frozen-files.json` 冻结交付文件。初次发现的说明歧义已处理；本审查未修改 QA 的候选文件。
