# 原生脸部制作可行性：尚不能代替当前自动生产链

**本轮不建议把换 VRoid 基模作为默认修复。** 本机核查没有找到可用 VRoid Studio 或 `.vroid` 工程；官方公开资料没有提供本轮能核实的 Studio 参数脚本/CLI。GUI 可作为将来的参考设计入口，但尚未证明 agent 能高效、稳定地保存参数并重复导出。不能由“软件会捏脸”推定“已有可持续自动生产”。原先目标审查中的原生新源建议降为备选，当前优先保留已有合法源和已验证 fit，修正完整脸部目标。

## 本轮实际证据

- 卸载注册表三处、VRoid 进程、Steam 三个已登记库的 app1486350 清单及名称目录均无命中；项目 assets-source/experiments、用户 Documents/Downloads 未发现 `.vroid`。Computer Use `sky.list_apps()` 也无 VRoid。范围见 `local-inventory.json` / `app-list-result.json`，不是全盘不存在证明。
- 现有 `assets-source/foundation/base-female-editable.blend`、`foundation-male/base-male-candidate-editable.blend` 是从旧 beta VRM 重建的可编辑文件，非原生参数工程。其保存/脚本/导出链已有项目证据，不需换源重建全部绑定才能修正造型目标。
- 官方主页 Windows 链接实际解析到 **VRoid Studio 2.16.0**；HTTP HEAD 返回 200、482150144 bytes、Last-Modified 2026-10-28。它是下载版本，不是本机已安装/实测版本。初始下载按 root 随后指令取消，留下明确 `.partial`，115343360 bytes，SHA见 `download-cancelled.json`；未安装、未执行、未验完整签名，二进制已局部 gitignore，不应提交。[官方主页](https://vroid.com/en/studio)
- 已读 Computer Use skill、guidance 与 confirmations，只执行只读应用列表，无窗口激活、输入、登录、接受授权或 GPU 操作。技能对 GUI 安装/运行新下载程序要求逐次确认，但本轮停止原因是**root 收窄为真实缺口核查**；安装审批不是整个 M2 的阻塞，不要求用户现在批准安装或出美术方案。

## 可确认功能与尚未确认能力

官方保存流程是 File→Save/Save As，生成 `.vroid`，版本升级建议另存；官方导出流程是进入导出界面、配置并导出 VRM，包含原生编辑的表达。脸部有整套 Face/Eye Sets 和各部位参数，可通过 GUI 数值框记录，而不必拖动到不可复现的位置。它们证明有**界面工作流**，不证明本机自动化、完整参数枚举或确定性批处理。[保存](https://vroid.pixiv.help/hc/en-us/articles/360012333774-Saving-a-model-you-created)、[脸部编辑](https://vroid.pixiv.help/hc/en-us/articles/4406164546969-How-to-edit-faces)、[导出](https://vroid.pixiv.help/hc/en-us/articles/15760756822297-I-want-to-learn-more-about-the-VRM-export-feature)

公开官方 SDK 的职责是 Hub OAuth、模型列表/下载并加载模型，不是 Studio 参数控制。按官方域检索 command line/API 未找到参数设定、无界面保存/导出的文档；这是“未发现可核实入口”，不是证明软件绝不含任何内部接口。搜索发现第三方内部 API/注入型 MCP，属于未批准的逆向路径，本轮未获取、安装或调用。[官方 SDK](https://github.com/pixiv/vroid-sdk-developers)

因此原生路线的真实缺口是：先有合法可用编辑器与工程，再验证 UI 定位、逐项值输入/回读、保存重开、两次导出。若以后做该试验，应记录每次动作数、人工/agent交互时间、失败恢复次数，并比较两次导出解码后的 geometry/skin/morph/material，而不只看文件 SHA（元数据差异须分开）。**本轮这些项目全部未实测，不能报一个角色只需几分钟或已可批产。** GUI 录入是每次制作成本，容易受版本、语言、布局、模态窗口影响；无法排除逐角色长时间操作。

许可也不是无差别继承：项目旧 beta New model 有已记录 CC0 来源；当前新默认内容非 CC0，Studio guidelines 对内部自己使用的模型生成程序与对外生成应用有不同条件。A–Z 样例另有限制。没有改变项目原许可结论，没有以下载、免费或商用允许推定可发布造人服务；本次也未接受新条款。[旧模型官方条件](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model)、[当前 guidelines](https://vroid.com/en/studio/guidelines)、[样例条件](https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z)

## 与保留旧源的实际差额

| 项目 | 新原生 VRoid 源 | 保留当前旧源、重设整脸目标 |
|---|---|---|
| 制作入口 | 需获得编辑器/工程；GUI 自动化与保存重开未实测 | 现有 .blend/Python、不可变 VRM、参数配方和确定性保存已用过 |
| 正常造型 | 作者部件与预设可提供关联参考；不保证选一次就好看 | 原源本身提供正常比例起点；先消除“口颏 +43%、同时横收33%”自拟目标，不能再把旧四参数当产品要求 |
| 关联几何 | 原生工具可同时编辑眼鼻口/下颌，仍须测混合与适配 | 共同 G 已有全源/端点/法线/J/Float32读回；只按 y 的 G 不等于任意五官形状控制，需要新的明确部件/关联目标 |
| 资产接入成本 | 新 sourceSHA、骨架/表达/morph/材质库存，旧全部 fit/profile 不能继承 | 可保原 mesh/skin/表达身份结构和已证机制；几何变化部分仍需新配方/适配/后验，不能借旧通过 |
| 持续生产效率 | 未证；GUI 每角色重复操作可能成为瓶颈 | 脚本数值生产已自动化（上一三样406701端点共14.45秒），但这不包括造型设计和审核成本 |

**最小接续建议**：按 root 已决定的旧源新 recipe，先从原正常整脸形态建立正面/侧面/3/4目标；脸长、口位、口颏长度、颌/颧宽分别有语义，并记录它们的相对关系。不要继续套 −.20/−.14/14mm 后检查它是否足够准确。由 agent 完成一次有明确正常造型意图的近景候选，先检查口颏比例、眼间距相对面宽、侧面颏与颌转折，再冻结该候选目标与实际技术门。101 可以测量目标实现误差，不能自行定义正常脸。若改变眼鼻口位置，新增关联部件/表达合同并实际回读，不能静默取消保护。

只做一个候选、一次近景审查，保留旧失败与当前 G/细分/接触方法证据；不重做八体、不更换运行引擎、不把无新增碰撞当造型通过。本包未生成新目标数值或新人物，也没有替 root 批准新方法实现。
