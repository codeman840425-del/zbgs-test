# 当前性能优化范围复核

公开bcade40d24f1，源c222404。只读源码和已冻结测量，不增加新性能通过结论。

换体剩余首绘制322.7ms：诊断原始program身份中，5个MeshDepthMaterial首次infoLog共约110.3ms，5个主色ShaderMaterial共约109.9ms。两类都仍有同步点，不能只认定阴影或单一缓存问题。数据来源body-switch-a0dd-diagnostic-v1/bcade-candidate/raw.json；GL调用耗时为CPU可见等待，不是GPU timer。此前私有逐program首次初始化01a在面部试验没有改善完整帧间隔，保持撤回，不重新调延时。

motion-source每次换体重新加载解析共享GLB。源track值只读，目标values与times另建；源对象会updateWorldMatrix，转换后geometry/material/texture全部dispose。没有应用级解析缓存；普通GLTF clone共享资源，不能不加所有权管理直接长期缓存。可能的独立方案是缓存只读源动画/rest变换并逐目标重定向，但没有当前分段成本测量支持实施。旧1188 parse/loadAnimation采样自耗时不能替代完整成本；createMotion约68.7ms包含鞋底与步态标定，不会因源解析缓存自动消失。本轮不添加推测性缓存，不修改封板动作或标定算法。

VRMUtils的removeUnnecessaryVertices会重排geometry index/attributes/morph数据；combineMorphs会重建expression binds及morph索引。当前均未使用。它们不能直接接在已有严格Face配方之后：会改变count/index/身份与表达绑定，需要独立派生、映射和重新验证；不能换SHA或跳校验冒充兼容。本轮不引入该资源转换。

结论：保留已测公开compileAsync局部改善，不为追求未定义的零首用停顿泛化重写。明确保留首次换体约0.32秒、首次面部编辑历史约0.1秒及普通设备未测；如继续专门优化，先以当前固定共享动作源的纯CPU分段计时证明收益，再决定有界缓存。当前没有可仅凭既有证据直接批准的下一性能补丁。

后续已完成所提唯一CPU采样：evidence/body-source-cost-bcade-v1。未能按资产拆分可缓存解析成本，createMotion约72.9ms和首用infoLog约208ms不由源缓存消除；决定本轮不增加缓存，不再追加此测量。该新增证据不改变上述技术风险判断。
