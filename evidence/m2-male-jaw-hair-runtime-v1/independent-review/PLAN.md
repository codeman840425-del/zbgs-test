# B：同款男性短发到男性下颌样件的限定审查

状态：合同设计只读审查；尚未收到实现冻结/固定构建，不代表运行通过。基线为公开 0fb420e5b124。A 六配方/同姿/影片证据保持原身份，不继承为 B。

## 已核当前接口

- `hairstyle-catalog.js` 当前仅按 `compatibleBodies` 选择款式。男性 sidepart 只允许原男 SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。
- 已有 source fit 描述 raw-head-bind-local / head / 独立隐藏 HAIR / rigid，但当前 runtime 只读 manifest+GLB，未消费该 source fit。
- `character-appearance.js` 当前保存 `replacementSHA256`，未保存独立适配身份；加载后挂 raw head。颜色意图在资产 await 前提交。
- `appearance-recipe.js` 当前 v5 保存 hairAssetSha256，加载后检查实际 GLB SHA。新增 jaw 准入不能只扩该旧白名单。

## 最小必要合同

1. catalog 按实际 avatar SHA 选唯一 fit；fit 自身明确 style、版本、目标 body SHA、GLB SHA、挂点/坐标与变换，配置有精确 SHA pin。相同 GLB 可以复用，但不能代替 fit 身份。
2. v6 导出实际已解析的 hairFit；original/none 明确 null。错误 fit ID/SHA/body/资源在提交新发型、配色前拒绝；缓存命中也校验。回退使用原实际 fit。
3. v1–v5 无 hairFit 仅继承历史 F/M 已准入款式语义。伪造旧版 jaw+sidepart 不因新 catalog 变合法；不改旧几何算子和身份。新 jaw 必须显式 v6 fit。
4. 实例私有挂载、geometry/material 与颜色状态；取消/卸载后晚完成不能覆盖新选择。原发恢复保留原几何/材质/可见性，不改变身体、骨架、衣服或动作。

## 冻结后最小检查

- 静态代码/CPU：正确 fit、错误 fit/body/hash、缓存后二次错误身份、旧 v5 原男保持语义、旧版伪 jaw 拒绝；v6 导出与回读实际身份一致。
- 一次实际固定候选：jaw 显式 fit 与原男同款；共用动作链和服装保持；两实例分别换发/颜色互不串；卸下恢复。
- 同条件近景/房间样板，描述发际/耳侧/后脑适配的可见差异和不足。不把错误零计数、同 GLB 或 CPU 通过视为观感通过。

等待 prototype 的实际 schema/实现后继续独立审查。此计划没有启动浏览器/GPU、改产品或新增资产。
