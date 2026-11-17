# Whole-look rollback and resource lifetime review

本次只读检查 root 的 rigid accessory prepared update rollback、foundation-avatar outfit rollback wrapper、appearance recipe 的逆序 rollback 和 live wrapper 动态委托。没有改源码，也没有启动浏览器或 GPU。

## CPU 结果

运行 `node scripts/m2-paired-ear-accessory-v1/qa-runtime.mjs` 通过，包含真实 Three/GLTFLoader source fixture。

- female/male 耳饰切换、旧实例保留、clone 失败恢复、重复切换和 dispose 通过。
- 新候选在 `childadded`、材质 clone 和延迟资源阶段被 dispose 或更新意图取代时，旧实例保持，候选几何/材质各释放一次。
- 两 actor 的 geometry/material 隔离通过。
- publisher 重复生成字节稳定，冲突文件拒绝。

## 源码核对

- `rigid-accessory-layer` commit 后保留旧 active group，rollback 恢复 `active/selection/desired/status` 和可见性，随后 dispose 释放新 candidate。成功路径 dispose 只释放旧 group。
- `foundation-avatar.prepareOutfit` 保存旧 outfit/底层角色，并把 equipment update 的 rollback 透传。appearance coordinator 用动态 `()=>update.rollback()` 委托 live update，不捕获旧 commit stub。
- appearance coordinator 在每次 commit 前记录 update，异常时逆序 rollback。live candidate rollback 恢复旧 object/identity/requested 状态，并在最终 dispose 阶段释放新对象。

本次没有发现可复现的 rollback 或资源重复释放缺陷。边界仍是跨 domain rollback 依赖每个 domain 提供正确 rollback。若某个未来 domain 没有该接口，coordinator 会报告“回滚不完整”，不会假称整套外观已恢复。结果不包含整套浏览器视觉验收。
