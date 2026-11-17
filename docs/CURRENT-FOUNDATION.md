# 当前角色基础工程恢复入口

更新：2026-11-17。当前 M2 未完成，M3 未授权；已拒的怪异预设不得借工具成功改为通过。完整目标见 AGENTS.md、docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt；能力事实只认 CAPABILITIES.md。

## 固定演示与保留项

- 工作台固定 http://127.0.0.1:4196/?workbench=appearance ，source eae6c66414cf741bec09629e2143915601bcb3d1，build d0f9ab216e05，experiments/native-mtoon-fixed-v1/prototype/dist，delivery/appearance-workbench.json。4174历史证据，4195 M1。新增检查区原生制作近景/1×录像入口；未将原生候选放入正式人物菜单。83de旧树与history指针保留。
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

1. froz单表达窄试验已完成封包。继续原生候选自身独立衣物提取与公共MToon装备加载接缝；用原内嵌/拆出衣物同姿态数值及实际画面对照，避免降级材质。未接完整factory前不更新正式菜单。
2. Bridge原生矩阵优先复用已证女性源，已补2.16女性25参数保存重开全等（parameter-reopen-result.json），继续男性源、必要模板/发束/表面接口；一次只操作一个编辑器，操作失败核真实嵌套结果。docs/research/VROID-BRIDGE-PLATFORM-FIT-2026-11-17.md区分工具与实测。
3. 新原生候选完整factory接缝，先核独立装备/coverage/接触/外观记录，不复制旧基模SHA、蒙皮或补偿。最小样件通过后再8预设；不把overlay推到普通菜单冒充完成。
4. 自适应路线下一步才是受限短动作的限位/代理与真实蒙皮接触，禁止改封存30秒舞。不要同时开启新自造外观算法。

## 并行、备份与桌面纪律

已知requested配置：face_target_feasibility=gpt-6-astra/high；asset_budget和http_transport_review=gpt-6.1-sol/high。每次followup明确任务难度/依据，不能声称修改模型。provider/hook实际拦截未独立暴露。派工记录 evidence/subagent-explicit-dispatch-2026-11-16.json。

主窗口单GPU/导出互斥；最新房间录制已结束并释放。桌面操作仅缺接口兜底，操作后立即turn_ended释放。当前后台MCP不需要控制鼠标键盘。

最近已核远端4cf6a23842cffc9be2017aa8bfc013a0081eae7f，含原生Bridge、froz单表达、独立衣物及MToon公共接缝、Mink与2.14卸载。其后增量未核push前不宣称备份完成。只stage明确owned路径；manifest精确字节用局部.gitattributes，ignore日志需显式-force并核index。公司副总工dirty/untracked绝不顺带提交；公司系统不在本轮角色职责内。

当前在途：4196新增原生表情对照入口已真实浏览器检查并发布，eae/d0固定树不可继续改。独立衣装eae/d0实际4周期录制完成但出现严重黑色描边外壳（位置差纳米级不等于材质通过），asset继续CPU因果定位；失败v1-v4保留。customitem单Top66→56保存/重用/冷开导出已过且提交8831af5e，尚非正式factory。原生只卸Tops试验已恢复Body胸部alpha，20衣物aux骨随之消失，face封读回，装备附骨接缝未做。http制作一件改袖Top的精确适配前置，不继承原78912身份。
