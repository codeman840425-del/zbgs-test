# 当前角色基础工程恢复点

## 版本与备份
- F:/gamemake，feat/m1-foundation-room。4196固定build64c973eb5a11，source 2c0f14282c5cccfe2c20a3bae61080cf20324053；以delivery/appearance-workbench.json为准。
- 固定目录experiments/m2-character-record-ui-release-v1/prototype/dist。01a回滚指针delivery/history/appearance-workbench-01a020d4e10d.json；4174历史证据，4195封存M1。不要新建常驻端口。
- 远端已核实a393bbcadb2a18a5d2b4818101ff2506062e5e42，包含f072完整源、01a发布及录像/检查。其后的在制修改尚未备份。公司副总工dirty文件不stage，禁止git add -A。

## 刚发布的限定成果
- 原生女843ac、改脸cc0843、改腰cf1574、男7586已补接麦克风/眼镜与原生目标30秒舞。mic VRM1 canonical thumb被VRM0 alias覆盖已修；男性v3仅改thumb。眼镜耳冠女≤0.678mm/男≤0.183mm局部交叉和刘海镜腿露点保留。旧封存30秒舞未修改。
- 01a D01完整记录包含独立identity/revision、appearanceRecipe、liveAccessories及实际引用身份。两源女脸/男实际磁盘保存、关页重开、同体恢复、503失败保旧、错误fit拒绝、最终commit故障逆序恢复及重试通过：evidence/m2-character-runtime-fixed-v1。正常速度9秒前/侧讲话片与全时段2fps诊断帧保留，未替代人类观感验收。
- m2-record-props-regression-v1四原生体实际按钮装卸、讲话/携带、暂停恢复通过技术回归；m2-character-record-ui-v2切体/准入与24影片播放通过；m2-record-release-live-v1实际4196原female+四native无pageerror、mic/glasses实际on。
- 两份确切提交独立检出build-v2逐文件一致。build-v1共享HTML CRLF与git LF不同的失败保留。UI-v1错误要求新9秒回读片>10秒，v2只修两新片时长门，原动作片门保持。
- 上个01a公开API需先选同一身体；旧配方保持不含live道具的原语义。01a不证明跨体；最新跨体结论见下，全部依赖包仍未完成。

## 刚完成增量与下一工作
- 4196最新64c973eb5a11/source2c0f14282c5cccfe2c20a3bae61080cf20324053，experiments/m2-character-record-ui-release-v1/prototype/dist。回退01a指针delivery/history/appearance-workbench-01a020d4e10d.json。此处覆盖上方早期01a版本描述。
- 跨体与UI源0cb65205测试/录像build f3d；发布64c仅改HTML说明，两固定目录运行源码/资源完全一致，构建都独立检出验证。正常12秒片放在native-production.html#character-records，保原f3d身份。
- m2-character-cross-body-fixed-v1十项实际跨体/失败保旧/取消通过；m2-character-record-ui-flow-fixed-v1实际保存/下载/读取/同ID跨体/坏索引/双标签页防覆盖通过；m2-autobody-workbench-ui-v1有25媒体解码与既有UI回归。
- root已集成record_body_restore_review(sol/high)与record_workbench_controls(sol/high)成果，已结束；实际provider/hook未证实。新身份不与body绑定，旧记录更新只对新实际造型准入；历史record先核envelope不拿旧fit套新体。
- UI记录存在localStorage，Web Locks+raw比较保护，不是服务器。低版本JSON拒绝静默覆盖；旧appearance配方语义不改。底层peer同体恢复限制仍保留。
- 下一工作包：D01/P03完整角色资源依赖移交（复用scripts/runtime-package既有清单/打包器），随后D03最小确定性记录消费；不把当前引用SHA列表当完整传递依赖闭包。其他M2必需能力仍查CAP。
- 备份正在核实本次发布记录，未核之前仅a393远端确定。公司dirty文件不stage。

## 有效边界
- CAPABILITIES唯一能力事实；M2完整v2范围不缩减，M3未授权。素材与参数其余缺口仍按清单推进。
- 原生其他配色/发型/耳帽/妆容/参数仍按真实准入，不能声称全部旧功能恢复。头发落座外扬、白上衣与肤色层次、所有速度组合及普通机未测保留。
- 女裙与旧30秒舞封板不重开；单GPU/录像串行，不接管用户桌面。普通机无设备，开发机不冒认目标实测。
- 最新用户追问“为什么新皮肤接入不完整”：完整VRoid含新身体/rig而非仅贴图，但未完成共用适配是工程缺口，不把工作推给用户、不为每体复制控制器。同体配色复用，几何修改仅重验受影响fit，新基模必须实际完成接入检查。

- m2-autobody-release-live-v1已实核4196 build64c：原female及四native的麦克风/眼镜实际加载，pageerror为空。顾问云端交接回执已补到docs/HANDOFF.md；未向其他聊天发送消息、未打整树包、未改变仓库权限。
