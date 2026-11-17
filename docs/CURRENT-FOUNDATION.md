# 当前角色基础工程恢复入口

更新：2026-11-17。当前 M2 未完成，M3 未授权；已拒的怪异预设不得借工具成功改为通过。完整目标见 AGENTS.md、docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt；能力事实只认 CAPABILITIES.md。

## 固定演示与保留项

- 工作台固定 http://127.0.0.1:4196/?workbench=appearance ，source 8d718127c827296f11aa254cd409a9ffd473975d，build c3e35248dc55，experiments/native-material-init-fixed-v1/prototype/dist，delivery/appearance-workbench.json。4174历史证据，4195 M1。检查区原生制作近景/1×录像入口；衣装录像86d4、表情83de保原身份；新原生候选尚非普通菜单。d0/83de旧树与history指针保留。
- 普通菜单男女各3有限样件；15失败预设仅诊断区，分区不等于模型已修好。既有失败和来源证据不改标签。
- 主交付仍4女+4男代表预设及可持续生产流程。女性裙装及30秒舞封存，不追加精修。普通电脑尚缺设备，用户允许保留缺口继续。
- m2-semantic-female-face-v1、m2-continuous-garment-fit-v1自造形变试验已暂停，不据历史派工恢复。当前先学习原生成熟制作流程；原运行时保留。

## 当前有效工具和真实证据

- Windows VRoid Studio2.16.0 + BepInEx IL2CPP be.791 + mcjo79 Bridge0.15.0已真实打开、保存、预览和原生VRM1导出。工具副本 experiments/tools/vroid-mcp-bridge-0.15.0/app-2.16；7811是内部桥，不是工作台。59工具可枚举，不代表59项均已验证；未注册GPT宿主工具或改全局配置。
- 源 assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid，SHA311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de；VRM78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3。保存工具身份、请求和复建说明在该包/environment.json、ENVIRONMENT.md；原发布stdio调用脚本call.py。
- evidence/native-vroid-room-78912-v1：同固定房间、真实VRM1 loader/共用motion/自身normalized骨架，站立+行走，blink/happy/aa/oh近景已实际运行。是test overlay，借旧实例根轨迹；未完整接factory/独立衣物/coverage/外观记录/碰撞。正常速度录像已存，不当8预设或完整角色通过。
- 默认导出VRM下游metadata为onlyAuthor/personalNonProfit/noRedistribution/modification prohibited。自制默认素材的原始许可和给下游的VRM授权分开核；不据默认值说pixiv统一禁商用，也不静默改meta冒称完成授权。
- 旧brainrom2.14源/原生参数读回仍保 assets-source/vroid-mcp-study-v1 与 evidence/vroid-mcp-study-v1。2026-11-17先另存男性源，再退出、官方卸载成功；17890/17891关闭，7811仍ready。旧安装包/插件/临时2.14副本递归清理被自动策略拒绝，残留仍在，见 evidence/vroid-214-retirement-v1。不要再启动2.14或称完全清理。
- froz3ncore/VRoid-Character-MCP固定6469bd3a6d00fe5fac508d992f63b5a1a783d80e：确有原生表情定义编辑、模板叠加/局部妆容独有价值。优先只测一个表情定义保存重开/导出，不重复主Bridge功能；本机裸2.16二进制双SHA通过allowlist。assets-source/vroid-expression-study-v1已真实完成Joy眉毛100→65、保存/冷开与双VRM导出，仅happy的实际morph数据变化；同房间近景与正常速表情过渡见其runtime-close-v1。其余157工具不推定通过。customitem原生保存已源码核查、未实测。

## 自适应关节与其他学习成果

- Mink原作者CPU示例/自包含碰撞测试已真实复现：assets-source/mink-author-study-v1、evidence/mink-author-study-v1。机器人示例不是人体通过。
- 原男性VRM→Mink/MuJoCo→VRM：assets-source/vrm-mink-roundtrip-v1，保69 raw/54 normalized，12骨、无碰撞体，无求解；rest/zero/单骨30°的真实FK回读通过。16文件manifest已root逐项SHA核。尚未人体限位、碰撞、短舞求解或避穿模；不能回答自适应已完成。
- MPFB原作者02样例459点变形与独立重开、CPU静态图已保 assets-source/mpfb-author-study-v1 和 evidence/mpfb-author-study-{v1,visual-v1}。不是二次元新基模，不替换游戏。

## 接续工作顺序

1. 原生独立衣物与MToon接缝已实测：别名映射和首次update(0)修复，v5无黑壳，原/独立各4cycles纯1×。新customitem改袖已在78912同房间原→新→原及4cycles实测；不要重做。继续843ac完整基体的真正factory接缝，不把overlay/CPU通过当完整角色。
2. Bridge原生矩阵优先复用已证女性源，已补2.16女性25参数保存重开全等（parameter-reopen-result.json），继续男性源、必要模板/发束/表面接口；一次只操作一个编辑器，操作失败核真实嵌套结果。docs/research/VROID-BRIDGE-PLATFORM-FIT-2026-11-17.md区分工具与实测。
3. 新原生候选完整factory接缝，先核独立装备/coverage/接触/外观记录，不复制旧基模SHA、蒙皮或补偿。最小样件通过后再8预设；不把overlay推到普通菜单冒充完成。
4. 自适应路线下一步才是受限短动作的限位/代理与真实蒙皮接触，禁止改封存30秒舞。不要同时开启新自造外观算法。

## 并行、备份与桌面纪律

已知requested配置：face_target_feasibility=gpt-6-astra/high；asset_budget和http_transport_review=gpt-6.1-sol/high。每次followup明确任务难度/依据，不能声称修改模型。provider/hook实际拦截未独立暴露。派工记录 evidence/subagent-explicit-dispatch-2026-11-16.json。

主窗口单GPU/导出互斥；最新房间录制已结束并释放。桌面操作仅缺接口兜底，操作后立即turn_ended释放。当前后台MCP不需要控制鼠标键盘。

2026-11-17本轮push已成功，ls-remote实核4e9a83664ed5d57636fe75b85432a7d6d7417da1，包含9dd原生factory代码/输入和266c实际录像/失败/独审证据；后续提交以再次核验为准。只stage明确owned路径；manifest精确字节保留，ignore日志显式-force并核index。公司副总工dirty/untracked绝不顺带提交；公司系统不在本轮角色职责内。

当前在途：完整843acca派生保130joint，只用原生卸Tops后完整Body PNG；原几何/权重/表达未动，双.vroid+离线生成脚本保留，无合并后的单一原生源。unmasked-base独审/重复构建通过；factory-fit原三衣新身份CPU核过。root正在接foundationProfile默认shorts、可恢复textureCoverage及保原材质/原发基础模式；face负责coverage模块/事务独审；http只读factory准入缺口；asset制作新袖Top在843ac上的实际重新适配。当前新增代码未固定发布，4196仍c3e。冻结裙/30秒舞不动，8预设仍未完成。

用户关于独立制作端的旁问：已解释运行时无需VRoid，MCP制作仍调用原生引擎；平台管理标准资源和可替换离线producer，逐项验证自身修改能力，不现在重写编辑器。官方guidelines的公开角色生成/输出工具许可与内部制作用途分开核。公司副总工挂墙镜69c阶段交付仅作收悉，不引入角色M2范围。

最新实际接入：source9ddf5794 / build148d21ba74e5，独立检出experiments/native-factory-fixed-v1，npm ci/build成功。evidence/native-factory-room-148d-v1记录真正loadFoundationAvatar/同房间/controller：843ac穿衣→原材质原发基础→恢复，texture covered状态正确、原生MToon保留、13秒路径1×录像完成；root看三截图及3fps全片联系表，完整接触和正常速视觉验收仍未通过，不改4196。基础有原生内衣贴图，不是身体缺面。暂停站姿碰到眨眼闭合帧，未当脸部验收。下一项：将asset的新843ac改袖Top真实fit纳入stage生成catalog，验证同人物两套衣物+外观保存恢复，再补坐起；新工作台分组尚未注册，测试URL只用?body=native-female-843ac-v1。旧面部配色/五官/附件准入仍拒新源，通用发肤色虽可调用但未验证。独审在native-body-texture-glue-audit-v1和native-vroid-factory-seam-review-v1。

新袖Top对843ac重新适配已封：assets-source/native-vroid-custom-top-unmasked-fit-v1，equipment.json SHA9cba67346ad2ed8f7d9af0af5fa941dec273e60330ca8f2616faa533eeab2edb，entry native-unmasked-843ac-sleeve56-top-v1。12文件root逐SHA/bytes核过，700点/1226tri、25使用骨及祖先精确；4未用Foot/Toe IBM微差记录，loader3姿最大15.37nm。仍仅CPU适配，未放public。注意现additionalManifests要求绝对/assets资源URL；stage应明确生成运行目录映射与新manifest身份，不能直接把离线相对路径送给扩展入口。无需再次造Top或再开原生编辑器。
