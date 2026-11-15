# 无发最小补丁，未应用

`bald.patch` 只包含审查用 diff：`character-appearance.js`、新 `no-hair-bodies.js`、`foundation-avatar.js` 的基础模式接入。未写入这些产品文件、未构建/浏览器/GPU。`bald-inputs.json` 固定生成时的原文件 SHA；如 root 已改相同行应人工合并，不覆盖正在录制的 v8。

语义：

- `hairStyle` 始终是用户选择，可为 original / none / 已准入新发；`effectiveHairStyle` 是当前实际显示。
- `setBodyMode('base')` 强制当前显示 none，保留 hairStyle；`dressed` 恢复该选择。基础模式内选择新发可预加载，但仍不显示，返回着装后显示；reset 恢复原发意图但不退出基础模式。
- 基础模式不删除眉、睫毛或任何皮肤，不删骨、不改变春骨管理。只控制全部材质均为 `_HAIR` 的独立网格。发现混合头发/非头发网格会拒绝无发，防止误隐藏皮肤。
- 原发恢复其原始 visible；所有缓存新发统一按当前有效样式显隐，避免重叠。none/original 清空当前 replacement 引用，修正旧状态可能遗留 SHA 的情况，缓存本身保留以供恢复。
- 取消沿现有 generation 逻辑：none/original 胜过旧请求；旧成功可缓存为隐藏，旧失败返回 cancelled，不污染新选择错误态。不是网络 AbortController，不声称传输已中断。dispose 后晚到对象释放、不挂到人物上。
- 五个精确身体 SHA 分别准入，状态字段分别保存。源头皮审查只有男女本体；三派生是基于现有局部派生范围的实现候选，未做派生无发几何/游戏验收。其他未知身体默认不开放 none/base 无发，需显式审查后增加记录。

root 可决定接入时机。基础模式接入点是 `foundation-avatar.setDebugBody`，不改 main 的模式状态或身体替换流程；main 原有换身体时按 hairStyle 转移的是保留意图，符合此语义。工作台若处在 base 模式，发型下拉表示“返回着装后的选择”，应在接入时显示这一说明；本补丁不额外改工作台文案/布局，也不强行把 dressed 页面默认切成 base。

实际 CPU 检查：`node evidence/workbench-face-source-audit-v1/check-bald-patch.mjs` 从 diff 在内存重建候选并执行，12项通过，含五身份、眉睫毛保留、错误/混合网格拒绝、缓存恢复、延迟成功/失败、base加载遮蔽、卸载及双实例。VRM/材质/网络/loader是mock，不等于真实资源或渲染通过。结果 `bald-cpu-result.json` 包含实际补丁 SHA。首次测试仅因补丁CRLF读取失败，修复证据生成器为LF后实际执行通过，产品文件未受影响。

`git apply --ignore-space-change --check evidence/workbench-face-source-audit-v1/bald.patch` 已通过（Windows源CRLF；普通不忽略空白的check曾拒绝）。上述命令只检查，不应用。

接入后的最小实物验证建议：五身份各一次 original→none→original 和 base→dressed；男女本体各一次新发→base→dressed，验证正/侧/后/顶、眉睫毛、原发/新发不重叠；延迟加载中进入base/选择none/卸载；两实例只改变一人；原有眼口颜色与shape无回归。root在交付v8后安排，不应以本CPU结果替代。
