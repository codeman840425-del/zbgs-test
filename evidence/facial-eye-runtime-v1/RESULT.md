# 眼裂宽 +1% 两态接入（未发布）

固定候选 **844e273263a7**：`experiments/m2-appearance-workbench-v15/dist`。只改变原男女已制作眼裂端点的资源加载、四域几何组合、工作台选择和草稿 v4；4196 发布指针未改。源 recipe 保持冻结身份，installer `scripts/install-face-eye-workbench.mjs --verify` 通过。

运行时 API：`set({eyeSample:'none'|'aperture-width101-v1', expectedEyeRecipeSha256?})`，state 提供 `eyeSample/eyeAvailable/eyeRecipeId/eyeRecipeSha256`。未传的其他域维持最近请求意图；`eyeSample:'none'`仅眼复位，`reset:true`全部恢复原geometry引用。原body SHA不伪造；geometryIdentity记录base与各recipe SHA和实际参数。

CPU正式证据在 `final-check/`：两体实际原VRM全Face primitive/outline与独立源端点，女56/男54表达POSITION/NORMAL全部比较；24个四域组合、11失败/生命周期场景，以及13项v4草稿迁移/事务检查通过。旧嘴眉鼻路径回归在 `legacy-three-domain/`，未覆盖旧证据。位置最大9.081纳米，源表达法线component最大女6.91414e-6/男5.63264e-6，原1e-5门未降低。四域法线用完整Face实际索引的独立Float64面积累加作对照，最大component差约5.92e-8。

初次失败保留在 `initial-failure.json` 与 `reproduced-initial-failure.log`。原runtime在absolute shape上先Float32(base+delta)并Float32累加，眼部薄面产生1.142919e-5差值。仅eye开启路径采用与源一致的Float64中间值，最终属性仍Float32。修前源通过反转确切三处修改重建，文件名明确 `.reconstructed.js`，并实际重新执行重现相同失败；不冒称有当时未保存的原始快照。眼关闭的三域路径不变。

`final-check`同时保存执行脚本、被测模块与SHA；新check支持 `--out`，已有report拒绝覆盖。Node同进程已准备资源时，三域与四域各3次CPU应用数据保留于summary；它包含clone/几何计算而无真实GPU，不能用作浏览器长帧或视觉达标。此前首次shader同步长帧不在本变更内修复。

必须继续实际有纹理正/侧/斜面、全闭/半闭/单眼与gaze验证。源相对原静态作者表达法线存在最大177°/148°差异，CPU“与源相同”不证明阴影正确。CPU alpha样点筛查不能取代渲染。没有宣称连续眼宽范围或新派生身体兼容。

复跑：`node scripts/face-eye-sample-v1/runtime-check.mjs --out evidence/<new-directory>`；`node scripts/face-eye-sample-v1/recipe-check.mjs --out evidence/<new-directory>`。故意失败重现：`node scripts/face-eye-sample-v1/reproduce-initial-normal-failure.mjs`，预期非零退出。
