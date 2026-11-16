# 固定功能换外观检查

实现新增纯数据 `appearance-contract.js`。document 的 replace-resource 分支按完整功能描述比较，成功后将原资源默认值与原实例状态合成的 effective 状态显式保留，再切换引用。CompanyError 由调用方抛出，details.differences 保存资源相对字段路径。模块之间没有新增循环依赖。

功能比较包括分类、功能角色、坐标轴、使用点身份及全部功能字段、阻挡足迹、安装和承载面、状态字段类型，以及明确声明的状态 schema/semantics。seatNodeId/backNodeId、材质和几何映射不参与功能比较，描述性的 limits/limitations 文本忽略，数值限制保留。纯静态无功能 decor 可以替换视觉身份。

upgrade 仅调整 compatibility 引用与检查。它复用同一功能比较，并在实际已有状态与目标默认合并结果不同时拒绝，错误精确到 part.state 字段。该守卫覆盖资源默认值变化和 part.state 默认变化。agent 明确保留原有效状态后可继续升级，既有升级状态合并代码未重写。

复跑命令为 `node scripts/company-platform/qa-appearance-contract.mjs`。report.json 保留输入 SHA256、运行前后未变检查及实际观察值。八组 CPU 检查覆盖真实 timber-sofa 与 lounge-sofa@1 的几何差异及功能相同，旧 sofa2 布局仍可 encode/decode，新 sofa1→2 替换拒绝，位置和使用点合同差异、mount/surface/state schema 差异、busy、原输入和保存字节保持、设备有效状态保留、显式模板升级防状态漂移。

真实 GLB 的 SHA256 与资源侧录一致，POSITION accessor 数量组合实际不同。这里只据此证明消费了不同几何产物。导出后的接触和包络独立检查保留在木框沙发生产包，真实角色使用和本轮新 GPU/浏览器检查未执行。

生产标准文档登记三份实际来源规格，给出单人座椅、双人沙发和桌面的固定参数、可变网格映射、统一提示词、同 designId 多规格批量输出、独立适配与重试、来源许可和正常导入检查。角色规格数量仍由总工后续建议，沿现有角色 M2 合同管理。

qa-upgrade.mjs 已在后续授权收尾中将兼容样件更新为 lounge-sofa@1→timber-sofa@1，并同步明确功能差异路径。受影响的八组升级检查通过，旧报告及旧脚本快照保留在 company-upgrade-v1 下。新生产规则拒绝 lounge-sofa@1→@2 的足迹变化。

未修改 render、asset-library、authoring、preview、catalog、templates 或简报，未提交 Git。请求模型/深度为 gpt-6.1-sol/high，实际配置和宿主 Hook 拦截未独立核验。
