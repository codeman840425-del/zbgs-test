# 原生四配色准入独审

**未发现本补丁新增阻断。** 只读审查6个实际源码并在独立目录运行作者8组检查和额外4组反例；不修改生产源码/文档、不用GPU/Studio、不提交Git。

已核入口：

- `appearance-color-policy.js`按843ac/7586精确SHA限定四字段原色。其为无import的叶模块；profile、query、recipe和两个runtime领域引用它，没有新增循环路径。
- `character-appearance.js`在revision/generation递增及I/O前拒绝；`facial-palette.js`在wanted状态/generation修改前拒绝。额外逐字段核拒绝prepare、整配方apply均不使原prepared过期，不改变材质、outfit准备次数或fetch数。
- 有效`reset:true`连同已知但本源不准入的颜色值，按最终意图回原色；两个实际领域一致，没有通过reset应用非原色。整配方仍按明确保存的字段校验，不把含非原色配方当重置。
- 查询只列original，默认配方可apply/capture；伪改profile的UI支持标志不会绕过runtime或query。返回的support对象改写也不污染后续策略。
- `foundation-profiles.js`两源UI支持四false，与此前值相同；工作台既有disabled逻辑不变。未在本包运行DOM/浏览器，root固定构建检查仍必要。

旧female/male在作者检查中保所有原query/recipe选择，真实hair/skin set+reset可用，eye/lip仍进入原资源准备路径。后者的图片解码刻意由CPU替身阻断，不能称旧像素/视觉回归完成。

未知SHA默认四true是**历史兼容策略**，本次只封两个已知原生来源。它不证明任何未知身体已有正确色彩分区/贴图或fit；未来新原生源须在同一精确来源表登记，不能用未知身份绕过制作验收。

证据：producer-replay/result.json（8组），counterexamples/result.json（4组）。实际源GLB/material由作者夹具读回并核SHA；texture decode和outfit呈现仍是CPU夹具。额外反例复用作者夹具，不复写原证据。准备独立脚本时初次PowerShell默认GBK读取UTF-8失败，随后因缺header发生fixtures未定义；修正证据脚本encoding=utf8后运行，生产文件从未修改。

运行入口：`node scripts/qa-native-color-admission.mjs <新独立输出目录>`；`node evidence/native-color-admission-independent-v1/counterexamples.mjs <新独立输出目录>`。当前输出目录已存在，脚本拒覆盖。最终6文件SHA见result.json；本结论仅适用于这些精确字节。
