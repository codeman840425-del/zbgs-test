# 独立覆盖层审查

结论：**本轮可逆渲染覆盖实现及当前运行时接触读取路径未发现新的阻断问题。完整身体接触证据有明确边界：旧 `qa-front-skirt-contact.cjs` 在覆盖开启后只测 visible-body，不可继续称完整 body 门。** 覆盖仍是未发布候选，本报告不替代动作边界/观感验收。

## 实际执行

1. `node scripts/qa-body-coverage.mjs`：现有 20 项通过，包括索引覆盖/恢复、重复 outline group 重映射、同源另一实例不变、错误身份/拓扑拒绝。
2. `node evidence/body-coverage-independent-review/check.mjs`：真实 Three.js `SkinnedMesh` 额外回归通过，混合骨权重、骨旋转、非 identity bind/父变换、启用 morph 的全部四点覆盖前后世界坐标差 **严格 0**。被隐藏三角独占的顶点仍通过完整几何读取；原 position/skinIndex/skinWeight 数组哈希不变。
3. 两个实例共享原 geometry、分别启用覆盖时，其新 geometry/权重属性互不共享；第二实例切换不修改第一实例。顺序重复为同 mesh 建控制器会拒绝。两次 dispose 只释放覆盖 geometry 一次，原 geometry 不释放，恢复原引用和原完整索引。

详细执行结果及审查文件 SHA：`additional-regression.json`。脚本、JSON 与本说明均位于此目录。未启动浏览器、GPU、性能测量或修改产品源码。

## 源码链确认

- `body-coverage.js`：先核配置 bytes SHA、body/top 精确身份、唯一 body primitive、Uint32 完整索引布局与索引原字节 SHA，以及每个 selected face 的实际三点，再创建替代 geometry。原 geometry 保存于按 mesh 独立的 WeakMap；只替换渲染 index 和对应 material groups，保留全部位置/权重/morph 属性。取消覆盖/释放恢复原对象。
- `m1-equipment.js`：新 coverage 失败路径恢复 source-clothing 可见性并释放 adapter；之后裙构造失败会额外释放 coverage。正常释放先释放裙，再恢复覆盖身体，之后释放装备。没有发现由新增覆盖对象引入的释放遗漏。此项为调用链审查，并非对完整异步工厂的浏览器 fault-injection。
- 普通装备适配来自 `foundation-profiles.js` 中 female 的显式 URL/SHA 配置；无配置返回 null，不推断同形资产。base/debugBody 随 top 一起关闭 coverage；裤/裙切换保留同一上衣覆盖。
- `motion.js` 后臀标定改用 `completeBodyGeometry(mesh)` 的完整引用索引。`getVertexPosition` 仍使用当前 geometry，但新旧全部顶点及蒙皮属性一致，独立 SkinnedMesh 回归覆盖此语义。
- 裙 thigh 半径标定在 `createM1Skirt` 构造中执行；当时 coverage 对象已创建但尚未启用，body geometry 仍为完整原件。鞋底标定读取独立鞋，不受 body index 覆盖影响。
- 当前手/前臂控制使用精确 body profile 的骨驱动包络；`seatHandSurfaces` 返回实际裙面，`createSkinContactWorkspace` 消费裙 geometry，不消费被裁索引的身体。这些当前运行时接触链没有因覆盖减少 body 支撑样本。

## 必须保持的证据边界

旧 `qa-front-skirt-contact.cjs` 直接用 `mesh.geometry.index` 枚举 body 三角。覆盖开启时，它枚举的是**当前可见身体**，遗漏了被上衣覆盖的身体面。本次独立反例明确展示：被移除三角独占顶点 1 不在当前 render index 中，却仍在 `completeBodyGeometry` 的完整 index 中。

因此旧探针不能为本候选出具“完整身体无交叉”结论；必须标 visible-body。根代理已确认本轮不拿它作为完整 body 门，新 probe 保留完整 geometry 引用后再切回穿衣，后续可分别记录完整/渲染两组。此处不要求修改碰撞阈值或增加通用平台。

本审查未测试网络并发创建同一 mesh 的多个控制器、任意新资产、多材料异构身体，亦未宣称衣服轮廓、覆盖边界或任何既有穿插已经视觉通过。当前固定配置和单实例工厂生命周期是本轮范围。
