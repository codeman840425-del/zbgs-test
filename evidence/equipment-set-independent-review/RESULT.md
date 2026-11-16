# 装备集合独立审查与最小修复

审查基线 `b8191de520351d454c6ff06b304e65e164494c97`。读取 equipment-set.js、equipment.js、m1-equipment.js 和原 qa-equipment-set.mjs；没有运行浏览器或改动作、裙舞、公共资源。

## 已证缺陷

真实男性身体/服装 GLB，只有图片解码以 1×1 DataTexture 代替。先显示 shoes，暂停较早 `equip(top)` 的加载，再发较新的 `equipSet([shoes, shorts])`。旧 top 在新 set 完成前仍返回 applied:true 并显示；新 set 网络失败时，最终也成了 shoes+top，未保留请求前的 shoes。

`before/report.json` 保留两种次序及旧模块 SHA `ec6c22a0bed2c49f9f04b486b1284419a98082a0b2d239f774075ff40765b48f`。`before/equipment.js` 为基线 Git blob 原字节。

原因：新 set 只在成功提交时递增 slotRequests，加载开始时未作废较早单槽任务。补丁只抽取 invalidateSlotRequests，并在合法 set 接受时调用；不更改可见状态、加载器、材料、蒙皮或动作。

## 验证

- after 两反例中旧 top 都 applied:false；新 set 待载/失败维持 shoes，成功后才原子变为 shoes+shorts。
- 反向：set 待载时，更晚单槽网络失败或未知 ID 均保留当前 shoes；旧 set 返回 superseded，不复活。单槽 API 原本在请求开始就递增 setRevision，此语义未改。
- 原有真实加载器四组门继续通过：整套冲突/未知 ID/错误 body、旧 set 被已加载 set 替代、长短裤切换、部分加载失败后的隐藏与重试。
- 独立槽位的旧 equip(top)/equip(pants) 仍可各自成功；不是把所有旧单槽请求改成全局互斥。
- pending set 中 dispose 后，无新容器挂回；观测的 13 geometry、13 material、10 texture 各只收到一次 dispose，重复 dispose 没有重复释放。此为 CPU 事件计数，不是 GPU 内存测量。

新模块 SHA `3733813545e28920cee6c0127b54ad595677b95aaf4d1cb97c60014ed7e76b6e`。只有 equipment.js 的请求作废逻辑改变，另外三个被审产品/原测试文件不变。

## 其余范围结论

最终集合先解算精确 body、互斥 slot、onePiece 对 top/bottom 的占用与 outerwear 的明确 layerWith，再检查全部已加载，最后同步赋 visible。现有真实 Group 的可见性赋值无异步间隙。M1 使用预加载集合，衣物切换后按最终 top 是否存在启用原 coverage；本轮没有扩大覆盖规则。

onePiece/outerwear 仍只有逻辑 fixture；单槽 legacy equip 保留原同槽替换语义，不应据此宣称它可验证新的多层组合。新组合应使用 equipSet。部分失败后成功加载的隐藏资源会保留为 adapter 缓存，最终 dispose 释放；这是现有缓存行为，不是失败后所有资源立刻销毁的承诺。

本次未证明新服装视觉适配或完整动作，不重贴旧 GPU 证据。修复后固定构建的实际回归由 root 安排。

## 复跑

在具备既有 prototype/node_modules 的对应源码检出根目录，输出到新目录：

```powershell
node scripts/qa-equipment-set.mjs <absolute-new-output>
node scripts/qa-equipment-set-race.mjs <absolute-new-output>
node scripts/qa-equipment-set-lifecycle-review.mjs <absolute-new-output>
```

旧反例须在 b8191de 产品源码上使用同一 race 脚本，加 `--expect-bug`；固定脚本快照在 executed。测试不修改服装/身体文件；图片解码夹具明确不能用作视觉验收。
