# 当前角色基础工程恢复点

## 版本与备份
- F:/gamemake，feat/m1-foundation-room。4196固定build01a020d4e10d，source f072400be849d70fcfec437ea580ce76a31977f7；以delivery/appearance-workbench.json为准。
- 固定目录experiments/m2-character-record-fixed-v1/prototype/dist。07b回滚指针delivery/history/appearance-workbench-07bab15f3382.json；4174历史证据，4195封存M1。不要新建常驻端口。
- 远端已核实a393bbcadb2a18a5d2b4818101ff2506062e5e42，包含f072完整源、01a发布及录像/检查。其后的在制修改尚未备份。公司副总工dirty文件不stage，禁止git add -A。

## 刚发布的限定成果
- 原生女843ac、改脸cc0843、改腰cf1574、男7586已补接麦克风/眼镜与原生目标30秒舞。mic VRM1 canonical thumb被VRM0 alias覆盖已修；男性v3仅改thumb。眼镜耳冠女≤0.678mm/男≤0.183mm局部交叉和刘海镜腿露点保留。旧封存30秒舞未修改。
- 01a D01完整记录包含独立identity/revision、appearanceRecipe、liveAccessories及实际引用身份。两源女脸/男实际磁盘保存、关页重开、同体恢复、503失败保旧、错误fit拒绝、最终commit故障逆序恢复及重试通过：evidence/m2-character-runtime-fixed-v1。正常速度9秒前/侧讲话片与全时段2fps诊断帧保留，未替代人类观感验收。
- m2-record-props-regression-v1四原生体实际按钮装卸、讲话/携带、暂停恢复通过技术回归；m2-character-record-ui-v2切体/准入与24影片播放通过；m2-record-release-live-v1实际4196原female+四native无pageerror、mic/glasses实际on。
- 两份确切提交独立检出build-v2逐文件一致。build-v1共享HTML CRLF与git LF不同的失败保留。UI-v1错误要求新9秒回读片>10秒，v2只修两新片时长门，原动作片门保持。
- 当前公开API仍需先选同一身体；旧配方保持不含live道具的原语义。不是完整跨体消费或全部依赖包已完成。

## 正在进行：D01自动选体与可操作记录入口
- root已在main沿switchFoundationBody实现记录离场完整预备，再compile、同步换体；同体复用原事务。新isCurrent守卫统一body请求代数，失败时不先销毁旧角色。尚未固定、未公开，不继承01a通过结论。
- record_body_restore_review：显式requested gpt-6.1-sol/high/fork none，complex；已完成只读链路审查，followup只写scripts/qa-character-cross-body.cjs，root执行GPU。
- record_workbench_controls：显式requested gpt-6.1-sol/high/fork none，complex；独占appearance-workbench.js新增完整角色记录入口，调用controller.captureCharacterRecord/restoreCharacterRecord。不能自动把身份绑定到body/gender；手工切外观不自动写盘。
- 两agent实际provider与hook拦截未独立证实；已记录evidence/subagent-explicit-dispatch-2026-11-16.json。
- 下一步：集成两源跨体成功与body/prop/fit/compile失败保旧、竞争取消检查；实际UI保存/下载/读取/关页恢复；确切提交构建与证据后更新4196、核远端。完整传递依赖打包仍下一接缝，不标M2完成。

## 有效边界
- CAPABILITIES唯一能力事实；M2完整v2范围不缩减，M3未授权。素材与参数其余缺口仍按清单推进。
- 原生其他配色/发型/耳帽/妆容/参数仍按真实准入，不能声称全部旧功能恢复。头发落座外扬、白上衣与肤色层次、所有速度组合及普通机未测保留。
- 女裙与旧30秒舞封板不重开；单GPU/录像串行，不接管用户桌面。普通机无设备，开发机不冒认目标实测。
- 最新用户追问“为什么新皮肤接入不完整”：完整VRoid含新身体/rig而非仅贴图，但未完成共用适配是工程缺口，不把工作推给用户、不为每体复制控制器。同体配色复用，几何修改仅重验受影响fit，新基模必须实际完成接入检查。
