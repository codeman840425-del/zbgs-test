# 原生独立发型 v3：固定版本 CPU 独审

结论：修复后的固定运行源码没有剩余本包 CPU 阻断，可以进入 root 的真实游戏验证；这不是视觉/接触或全平台准入。最终 runtime/GLB/fit/manifest SHA 见 `result.json`。未修改生产文件、未用 GPU/Studio、未提交 Git。

独立源回读确认两 HAIR 的 POSITION/N/UV/WEIGHTS、引用索引及正权重 JOINTS 语义、64 IBM、MToon/图像与源一致。64 是 skin 表长度，实际正权重 union 为 52；59 动态骨、15 身体代理、12 发链、22 collider、10 group、原 Root center 保留。目标7586原发只有一种 HAIR 材质，输出两种并不要求目标也有两种。

已确认并闭合两个不同问题：

- 资产原验证 36 步最大 0.468775558 mm：第1步 Hair1_01 的 bone/parent/tail 入口一致，child 世界矩阵却不同，导致官方 `_calcWorldSpaceBoneLength()` 读到 0.0511423306063 / 0.0508792666991 m。提取侧递归刷新子树，而完整源侧未在同一时相刷新。只给完整源 manager 入口同相刷新，误差成为 2.01835e-15 m。此为夹具时相差，不改资源、物理参数或门，旧失败保留。单纯把资产脚本递归改非递归而不标 dirty 也失败，保存为反例，不作为修复。
- 运行模块原 0.574054869 m：`matrixAutoUpdate=false` 的代理直接写 matrix，未标 `matrixWorldNeedsUpdate`；当前 Three0.187 的 `updateWorldMatrix()` 默认不会刷新已清 dirty 的节点，下一层拿旧父矩阵求逆而累积。实现方在 `native-hair-attachment.js:191` 写 dirty 后，独立36步全部引用顶点最大 1.92156e-15 m，15代理最大矩阵元素差 6.66134e-16。只删除这一个 dirty 赋值的隔离负例可重复恢复大偏差，不改生产。

`lifecycle-check.mjs` 真实载入原7586和官方插件，独立核动画中的 head/chest/arm、非identity avatar.scene 位姿时加载；15代理world一致，不写目标骨；两个实例互不影响；每步manager与每种MToon正时间更新一次；0时间、隐藏、暂停不积分，reset跟随当前位置。自有15个几何/骨架/材质/实际uniform贴图资源销毁恰一次，目标资源不销毁，另一实例仍能更新。wrong identity/material/mount/duplicate target及真实静止姿态不符拒绝；后解析失败资源释放；实际appearance过期prepared拒绝、切回原发恢复、加载中dispose不复活均过。

早期两次 lifecycle 夹具失败保留：当 root 同时完成真实catalog登记后，测试仍添加同ID造成两条准入项，正式 `hairEntry` 正确拒绝；最终测试使用真实唯一catalog并mock固定资源fetch，未削弱拒绝。当前目标枚举跳过已拥有native子场景，避免其代理被误认为原生目标骨重名；target本身重复名称仍拒绝。

旧v2的rest-identity门保持不变。v3原作者 Head IBM 已有约20.68μm偏差，不冒称原矩阵严格identity；这里以原GLB字节/绑定身份、源目标rest结构及实际源蒙皮坐标等价核验。作者N/贴图/原spring均未修写。

剩余必须实际看：独立发型从原发切换/切回与关闭恢复、暂停首次显示、走/坐/头肩动作时头皮附着和身体/衣服接触、MToon透明/轮廓/阴影及双实例释放。没有新增环境collider；不能因原完整源曾录制而宣称本独立件已看过，也没有普通机性能证据。

复现：`node evidence/native-hair-v3-independent-v1/lifecycle-check.mjs`（结果拒覆盖；复现时复制到新独立目录）；`node evidence/native-hair-v3-independent-v1/runtime-frame-probe.mjs <新输出目录>` 核当前实际模块36步；`node evidence/native-hair-v3-independent-v1/stale-proxy-negative.mjs <新输出目录>` 跑仅删dirty的测试负例。源属性脚本为 `source-readback.py`。三份约50MB逐joint诊断已逐字无损gzip，压缩与解压SHA在 `compressed-traces.json`，不删除失败信息。`native-hair-attachment-observed.js.txt` 是最终固定源码快照，不冒称修复前源码。
