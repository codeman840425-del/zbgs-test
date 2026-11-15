# 配方文件交接（待固定浏览器验证）

复用 workbench-appearance-recipe-v4，未新增 schema。新增 UI“下载配方 / 读取配方”及同事务 agent 接口；本轮没有构建、运行浏览器或修改发布指针。眼部候选 084 不含本次功能。

## 入口与范围

新固定候选启动后，干净浏览器直接打开 `http://127.0.0.1:<候选端口>/?workbench=appearance&body=male`（本包两份文件均为原男性）。按配方 `base.bodyType` 选择对应房间 URL；女性使用 `body=female`。在外观保存区点“读取配方”，选择 JSON。无需 localStorage，无需先手调数值。

不自动跨体；错误会以女性原版/男性原版/下颌样件等名称说明，资源 SHA 仍须完全匹配。文件只带外观、几何、服装及其依赖身份，不带动作、镜头、账户或资源本体。读取不写 localStorage。

Agent：`__debug.exportAppearanceRecipe()` 返回原生 v4 JSON 文本；`await __debug.importAppearanceRecipe(text)` 执行同一验证/恢复事务，结果 applied/cancelled 或抛出失败信息。加载期间第二次导入明确拒绝，较新的直接外观/几何编辑仍按原 revision 规则取消旧事务。

256 KiB UTF-8 上限；JSON 对象检查后走既有版本/base/resources/bindings/几何 expected SHA 校验。文件读取 await 前记录 actor/各域 revision，期间变化则取消；销毁也可取消。原有 busy fieldset 会同时禁用下载/读取，加载中 API 导出明确拒绝。

## CPU 实测

`scripts/face-eye-sample-v1/recipe-file-check.mjs --out NEW_DIR` 使用真实男 Face 属性、真实 facial-geometry 和 recipe 函数、当前设备 getter；颜色/controller/File 和 HTTP 为可控制 fixture，没有浏览器和渲染。

cpu-3/report.json：17 项通过。两份合法配方 `cpu-3/recipe-a.json`（+4%嘴、眉鼻眼端点、黑发、长裤）、`cpu-3/recipe-b.json`（-4%嘴、其余原位、原色、短裤），分别从新实例恢复精确 v4 值。错误身体/GLB资源及绑定/几何依赖/规则/发型身份、真实 HTTP 503、超大/无效JSON均留原状态。文件读取中颜色/几何/服装/actor/销毁取消；恢复中直接颜色新意图保留。

cpu-1 是测试跨 VM 对象 prototype 比较错误；改为 JSON 值比较。cpu-2 是测试误期望第二导入排队，真实既有 loading guard 拒绝；保留失败说明，未为测试改变产品事务。

## 尚待实际 UI

固定新构建后，两份合法配方各在全新 browser context 从文件选择器读取，核 snapshot，再点“下载配方”，捕获真实 download JSON 与输入按值比较。不能用 debug-only 代替这两次用户路径。另核人类可读异基模提示、加载期按钮禁用、文件重选与下载后可重复读。此 README 不将 CPU fixture 称为干净浏览器/文件对话框已通过。
