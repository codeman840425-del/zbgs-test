# 当前角色基础工程恢复入口

更新：2026-11-17。当前 M2 未完成，M3 未授权；已拒的怪异预设不得借工具成功改为通过。完整目标见 AGENTS.md、docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt；能力事实只认 CAPABILITIES.md。

## 固定演示与保留项

- 工作台固定 http://127.0.0.1:4196/?workbench=appearance ，source f749069c24bdd086127167e2d73707249581c4a8，build f2df648c612b，experiments/native-factory-fixed-v4/prototype/dist，delivery/appearance-workbench.json。4174历史证据，4195 M1。检查区原生制作近景/1×录像入口；衣装录像86d4、表情83de保原身份；原生女性候选已加入外观菜单；新源发型配色未验并禁用。c3e/d0/83de旧树与history指针保留。
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

## 当前主包进度（2026-11-17接续）

- 女性843acca完整基体已真正接factory，并以原三衣+改袖Top独立装备运行。输入/fit/coverage均保精确SHA，不复制旧人体补偿。新Top运行catalog5e261，原生defaultOutfit索引和紧凑JSON配方导出已修；完整record未删字段，136993B在原256KiB门以内。源a462e8ff。
- a462/build58f074bf7cae实际房间保失败：曲线碰椅角clearPath吞掉sit意图，原片与snapshot在native-factory-room-58f0-v1。
- 修复dcf00bde/build78717fc659c9固定树experiments/native-factory-fixed-v3。native-factory-room-7871-v2实录正常速35秒：原衣/基础保原材质原发/恢复/改袖、同页与关闭后新页配方恢复、行走→坐起→走到空位→源短舞→idle。无browser errors。v1没有断言舞蹈实际启动，椅旁请求被拒，故该轮不计舞蹈；原失败保留。root看v2全部71张0.5s抽帧，落座约21s长发短暂外扬，近景及1×观感仍需审查。不开普通机通过。
- 独审又复现桌边浅角度碰撞恢复死循环（10s/1200次），evidence/native-seat-curve-independent-review-v1。face_target_feasibility正在main导航范围有界修复，保开放转弯。4196仍c3e，不能发布7871。
- 新native女性工作台选项已入dcf，未测发肤/眼唇配色在UI禁用，基础模式保原发提示已分开；尚需固定页实际菜单验收，native-production页仍待更新当前证据。
- 男原生源a18a保持79骨，原生卸Tops donor恢复PNG cfd186（非女PNG），真实保存/冷开/导出已完成并恢复原编辑窗口。male-skin-recovery-v1保18调用。保原91node/79joint派生7586d3bc已生成，139accessor/160view/原BIN与其余图不变；重复构建和错源/覆盖拒绝过。assets-source/native-vroid-male-unmasked-base-v1；root逐核male-preflight/skin-recovery/unmasked三个package共118文件SHA和bytes。
- 男新源尚未factory/装备/GPU通过。asset_budget正在male-equipment-v1提取男性独立三衣与coverage CPU数据，不改运行控制器。不借女性结论。

## 接续与备份

1. face修复浅角度livelock后核独审反例、固定构建并补导航/实际房间录屏；不反复重造已验衣物。
2. native-production入口更新真正factory/配方证据，再验证工作台真实菜单。新候选通过受影响检查才更新4196，旧固定树保留。
3. 接男79骨三衣/coverage到同一工厂，实际换衣/冷恢复/动作。下一步才继续原生外观生产与八代表，不重写编辑器，不进入M3。
4. 远端已核efd30d2c；a462/dcf及本轮证据/男性包尚待本轮明确stage、提交、push和ls-remote。公司dirty不stage。当前仍M2未完成。

用户关于独立制作端的旁问：运行时无需VRoid，MCP制作仍调用原生引擎。平台管理标准资源和可替换离线producer，逐项验证关闭工具后的自身修改能力；不直接重写闭源编辑器，不假称VRM保留全部原生参数。官方guidelines对角色生成/输出应用有额外许可与自用例外，公开产品用途需核，不将MCP开源当素材开源。
公司副总工边几e1b交付消息已收到，只作独立信息，不引入本轮角色职责；普通机/C3未验。

最新安全衔接：浅角度恢复v2及独审通过，main cd075d9a；固定source f749069c/buildf2df648c612b真实重复完整房间链（native-factory-room-f2df-v1）通过限定技术检查。native-workbench-f2df-v2实际菜单切人不换document、禁未验配色、原生基础/穿衣/改袖保留、旧男女按钮正常。UI v1误把history.replaceState的framenavigated算刷新，失败保留；v2用真实document请求和窗口标识核验。4196已切f2df且HTTP build/媒体回读通过，回滚delivery/history/appearance-workbench-c3e35248dc55.json。仍未人工视觉验收/普通机实测。

男性三衣与coverage数据已封，root核41项SHA/bytes，三姿实际loader和重复生成/错误拒绝过。face已实现男女限定coverage准入表，http独审中；asset正接男性profile和public/staging，尚未新男GPU。上述在途公共覆盖代码不在f2df固定版内。
