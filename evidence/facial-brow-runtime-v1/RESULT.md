# 眉组合端点：源审查与最小运行时接入

2026-11-15。本轮只接入原女/原男的 **原位** 与 **眉高 +1 mm、每侧眉距 +1 mm** 两态。没有放行独立眉高/眉距滑块、负端点、连续区间或派生基模。源码未改人体、动作、VRM 表情控制器、颜色材质和装备。

## 源依据与风险

读取 `assets-source/face-brow-parameters-v1/{README.md,spec.json,audit.json,source-inspection.json}` 和源生成/审计脚本。两体各 110 个实际 FaceBrow 引用顶点、160 三角，权重仅 Head；所有绝对表达使用相同平移，所以保持相对 POSITION delta 正确。眉与嘴宽非零区域交集为 0。原节点、眼骨、UV、Body、材质/纹理不动。

源报告的皮肤间隙是顶点和三角心有限采样，不是所有透明过渡像素或表达混合的连续证明；有纹理侧面是否浮眉仍未验证。仅 16 个 alpha≥0.5 样点不能升级成视觉验收。当前尚无必须否定这一个小样件的源证据，适合隔离实际回读。

原眉 recipe 是离线接口，缺少当前加载器要求的 `primitiveIndex/uvSha256`。新 installer 对照相同原底已锁嘴宽身份补入这两项，保留 `sourceRecipeSha256`，没有改写 pose 的源 recipe 或冒用其 hash。

## 接口与求值

`set({mouthWidth,browSample,expectedRecipeSha256?,expectedBrowRecipeSha256?,reset?})`：

- `browSample` 只接受 `none` / `height1-spacing1-v1`。
- 省略某项保持该项最新请求；`mouthWidth:0` 只复位嘴；`browSample:'none'` 只复位眉；`reset:true` 全复位。
- 从共同不可变原底求值，先嘴宽仿射再眉平移。眉平移不改变任何表达 delta，也不改变眉片法线；嘴宽沿用全脸合并索引法线计算。
- 同一个 actor 共享新属性给所有 Face primitive/outline，其他 actor 和原始属性不改；保持原 mesh、material、skeleton 与 morphTargetInfluences 引用。
- `prepareRender` 仍在提交前执行；过期、卸载或 shader 预热失败不提交，所有临时 geometry 清理。
- 版本预检先于几何变更。身份记录原 base SHA + mouth recipe SHA/value + brow recipe SHA/sample，不伪称源 VRM 文件已改。

`getState` 保留原字段，新增 `browSample/requestedBrowSample/browAvailable/browRecipeId/browRecipeSha256`；`geometryIdentity` 同样包含眉字段。非零眉初次加载后才有 recipe 身份。

## 可重复执行

```powershell
node scripts/install-face-brow-workbench.mjs
node scripts/install-face-brow-workbench.mjs --verify
node scripts/face-brow-parameters-v1/runtime-check.mjs
node scripts/face-brow-parameters-v1/legacy-mouth-check.generated.mjs
```

最后一个是原嘴宽 CPU runner 的冻结副本，仅改变报告输出地址，其头部保存输入源码 SHA，未将它计作生产生成脚本。

## 实际结果

`runtime-check.json`：真实原 VRM 属性构造的 Three CPU 对象 + 当前实际模块，HTTP 为本地 fixture，未使用 GPU。

- 女眉 Basis 对独立导出最大差 0；56 个表达/嘴宽两端组合最大差 3.7253e-9 m。
- 男眉 Basis/54 个表达/嘴宽两端组合最大差 7.4506e-9 m。
- 9 primitive + outline、嘴眉独立复位、无累加、另一实例保持原几何、表情引用保持、全零精确原引用恢复、owned geometry 销毁均通过。
- 等待加载时 reset/dispose/后请求胜出、503、错误 SHA、未知基模、预热期间 reset、预热失败均通过。失败保留此前嘴宽和几何。
- `legacy-mouth-check.json`：旧嘴宽范围/端点/所有形态/正常有限与未影响区保持/原属性身份/错版本/失败/取消用例仍通过。
- 未验证：真实 VRMLoader 后 GPU/透明纹理/侧斜面浮眉、多个表情混合、UI/草稿恢复及目标设备耗时。交由根与 QA 做实际回读，不从 CPU 数值替代。

## 固定身份

- 测试模块 SHA：`f35353492151bb7d12d72928b48406d91d7648faf4aa10b470a3479775c7f644`。
- 安装 manifest：`d19748382d0473dd678de6597cccda2bc50b9e13cc401f34d59ba471bc65b13d`。
- 女 runtime recipe：`4b8a6c09a86aa5b8d51f31842e2c95fd71d567c2de793acafb5ae13a6c04ce7c`；源 recipe：`7f0765f7df577f983cb7641715029006ffc43e290fc203c4ed2110cde6f7ac0b`。
- 男 runtime recipe：`895317030af557621b248b6731ad4a80e998f2f13ed18f0616d81355772e9983`；源 recipe：`3e16c6fb8febe41a7f494fa3050cf4fcc8fc2fc829f81465e4429b52f3c7dbf4`。

测试模块副本在 `source-tested/facial-geometry.js`，后续根格式化/集成时应以新的实际构建身份记录 GPU 结果。
