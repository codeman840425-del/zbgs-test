# Additive logical use-point API review

审查时点为 2026-11-16。检查对象是工作区未提交的 `prototype/src/company/use-point-data.js`、`prototype/src/company/render.js` 接口增量和 `scripts/company-platform/qa-use-point-data.mjs`。没有修改产品或角色代码，也没有运行 C2 全套检查。

## 结论

本次增量没有发现实质性缺陷。定向 QA 实际运行通过 8 项：

```text
node scripts/company-platform/qa-use-point-data.mjs evidence/company-c3-use-point-data-review-run-01
8 logical use-point checks passed
```

源文件 `render.js:210-214` 在 `live()` 后调用 `describeCompanyUsePoint`，因此销毁后访问仍按现有 `scene-disposed` 语义拒绝。`describeUsePoints({floorId})` 只接受派生文档中的真实 floor，未知楼层抛出 `unknown-floor`。building 模式和其他楼层不依赖 `current.points`，所以逻辑描述继续可查，同时保持 `resolveUsePoint/listUsePoints` 的可见 Mesh 语义不变。

`use-point-data.js:9` 用 `point.world`（设施完整嵌套世界变换）叠加 `point.position/yaw`，只计算一次使用点局部偏移。`approach` 和 `exit` 按当前资源合同作为 facility-local 坐标，在 `:19-20` 直接通过 facility world 变换得到世界位置，不重复添加 use-point offset。QA 的双层、同名房间、平行/旋转布局和旋转双座沙发样例均通过，实际 Mesh 世界位置和逻辑变换一致。

返回值在 `use-point-data.js:12-25` 经过 `structuredClone`，不泄露 Mesh、占用租约或角色对象。修改返回对象后再次读取保持原值。`resource` 保留文档中的真实资源 ID/version，`contact` 保留声明的 seat/back 网格名，`missingFields` 显式列出缺少的 approach、exit、capacity、clearance。旧 `facility-catalog` 椅子样例的缺字段返回 `null`/列表，不推造默认接近点。

## 构建与打包核对

`prototype/scripts/build-company-id.mjs` 递归收集 `src/company`，所以新增 `use-point-data.js` 会自动进入 `inputs`、`sourceDigest` 和 `shortId`。`prototype/vite.company.config.js` 从 `preview.js` 入口构建，`render.js` 的静态 import 会把该模块纳入 bundle。`scripts/company-platform/package-company.mjs:70-85` 使用 build-info 的完整 `src/company` 输入集合并重新计算 digest，因此固定构建必须先重新运行 build-id，再执行打包，不能沿用旧 build-info。

`qa-use-point-data.mjs` 位于根 `scripts/company-platform`，是 CPU 检查脚本，不属于 `prototype/src/company` 的 build-id 输入，也不进入公司运行包，因此它自身不会改变构建身份。新增的 `use-point-data.js` 以及被其引用的 `render.js` 会进入递归 `src/company` 输入集合。当前审查没有生成或替换正式 build、dist 或 manifest。

## 保留边界

逻辑描述只提供坐标、资源/接触网格名和声明字段，不保留 Mesh，也不实现资源保留/重绑定。角色仍需在 C3 接入时显式请求接触资源，继续使用既有租约和任务状态。该 API 不能单独证明人物可达性、坐姿、接触或离位正确性。

审查以公司固定提交 `aff9dd8b3eeca02ecbb3e110f0b572a294a3e193` 为基底，检查当前工作树的未提交逻辑接口增量。新增文件未提交，未创建 Git 提交。
