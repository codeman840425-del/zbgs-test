# 显式组合模板升级

新增生产模板 stream-station@2，将默认桌子局部 Z 从 -0.9 改为 -1.05。templates-extended.json 保留 templates.json 原文件头和全部原条目的原始字节前缀，仅在数组末尾追加版本 2。旧版本模板及其存档摘要保持一致。新增模板不会自动修改已有工位。

## 数据入口

`prepareTemplateUpgrade(document, stationId, targetRef, {catalog, templates, isUsePointBusy})` 返回 `{document, changes, retainedOverrides}`。

targetRef 必须含确切 id 和整数 version，源模板从指定工位的确切引用取得。函数同步准备独立候选，成功后 revision 加一，输入文档、catalog 和 templates 均保持不变。changes 记录模板切换、部件增删及 parentId、resource、transform、state 的实际变化。retainedOverrides 按 partKey、实际 instanceId、field、value 记录保留的局部数据。调用方负责候选资源加载及发布。

- 按 part.key 对齐已有设施，保留实际 ID，包括完全不含工位前缀的合法 ID。新增部件 ID 会避让文档全部现有身份，也避免复用本次已删除部件的旧身份。
- 旧默认 transform 未变时采用目标默认，局部 transform 有变化时保留。父 partKey 变化且存在相对位置覆写时拒绝迁移，错误包含具体部件、transform 字段及前后父键。
- 逐字段迁移 state。实例明确存储、且不同于模板 part.state 的字段视为覆写，即使值等于资源默认值也保留。资源覆写造成的有效默认状态差异同样保留。其余字段采用目标模板默认。appearance 和其他实例局部字段保留。
- 已匹配部件及资源覆写须符合目标角色、分类、挂接方式及完整声明的 usePoints 合同。材质槽和状态字段再通过真实目标资源的 derive 校验，桌面设备须适配最终实际父桌面。无法兼容时报告具体 part/field，保留原输入。
- 删除未调整的默认部件可成功。部件存在 transform、resource、state、appearance 或其他实例局部字段时拒绝删除。其子树存在自定义节点依赖时也拒绝删除。
- 完整候选通过 deriveCompany 和 inspectCompanyPlacement 后才返回。源工位子树中任何使用点 busy 均拒绝。接口只消费回调，不保存角色锁或任务状态。

默认判定依据现有数据值。对于值与原模板默认完全一致、且数据合同没有另存意图的修改，无法识别其历史操作意图。

## 验证

复跑 `node scripts/company-platform/qa-upgrade.mjs`。report.json 保留九个输入文件的 SHA256、执行前后身份检查及实际观察值。八组检查覆盖旧存档默认不变、显式默认更新、实际 ID 和兼容覆写保留、部件安全增删、父级改变拒绝、资源合同及实际 surface 拒绝、busy、placement 失败保旧，以及升级结果 encode/decode 回读。

测试使用真实 library-catalog 的材质槽。沙发资源覆写已按固定功能规则更新为 lounge-sofa@1→timber-sofa@1 及其 fabric 声明，组合模板仅作为内存测试输入。缺字段、角色、使用点、桌面高度和材质槽的不兼容目标均为明确内存反例，未追加美术素材。upgraded-layout.json 是真实默认双工位图中单个工位升级后的完整结果，可配合 library-catalog.json 和 templates-extended.json 继续读取。

固定功能规则收严后的八组升级检查通过。旧报告和旧脚本保存在 pre-fixed-function-report.json 与 qa-upgrade-before-fixed-function.mjs，保留原兼容尺度证据。新路径断言指向完整功能差异，当前版本拒绝 sofa1→2 足迹变化。

本轮仅验证 CPU 制作数据及既有保守静态 placement。未启动浏览器或 GPU，未修改既有文档、渲染、存档或预览模块，未接入角色或多层完整存档，未提交 Git。实际材质渲染和角色使用保持 C3 验证范围。请求配置为 gpt-6.1-sol/high，实际模型、思考深度及宿主 Hook 拦截未取得独立核验。
