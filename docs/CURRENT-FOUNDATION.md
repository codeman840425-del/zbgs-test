# 当前角色基础工程恢复入口

更新2026-11-17。F:/gamemake，feat/m1-foundation-room。M2未完成，M3未授权。恢复读本文件、AGENTS及本工作包相关CAP条目即可；不重读历史流水。

## 目标与边界

- 完整目标：docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt；CAPABILITIES是唯一能力状态，FOUNDATION-MILESTONES管范围/退出条件。
- 交付agent可持续制作/修改/转换/验证的角色平台，游戏直接消费；不是无限精修展示人物，也不是重做VRoid。用户再次提醒目标，完整M2不能缩为几个样件。
- Phaser + Three.js + VRM。原生制作工具可替换，游戏不连接Studio；生产仍依赖离线Studio的具体功能。导出VRM不保完整原生编辑参数。公司平台由副总工负责，不stage其dirty。
- 封板女性裙装和30秒舞不重开。普通电脑无设备，开发机不代替实测。八代表/完整M2未通过；被拒怪异批次只在检查区留失败，不换标签准入。

## 固定交付与证据

- 4196工作台：source 1ffe0b54 / build f583cfa84f04，experiments/native-face-fixed-v1/prototype/dist；delivery/appearance-workbench.json为准。原c272指针/树保留，可回滚。4174历史媒体，4195封板M1，不新增常驻端口。
- 新女843ac、新男7586已在外观菜单，均独立三衣；女另有改袖Top。真实factory走坐起短舞/基础保鞋/关闭页配方恢复见native-{female,male}-room-193b-v1，保录像身份。新源细节接触/全部速度/普通机未通过。
- 男7586独立HairSet001长直发：native-hair-{room,close}-416b-v1两段35秒1×，原源同镜头材质对照render-v2。原生2材质/59动态骨/12spring，只有一个人物；保肩衣交叠、落座前发外扬和侧面家具遮挡，非人工自然度通过。c272仅加入口，不改旧录像身份。
- 男7586原生虹膜original/green已发布：native-iris-room-v2，12秒1×讲话/眨眼/微笑/视线，原源同镜头眼区262×63逐像素全等，原生长发+绿眼配方冷页恢复。native-iris-workbench-cb427-v2实际菜单/旧配色/8媒体检查通过。V1测试跨体准入预期错误与脚本作用域错误保留，不是删失败换标签。
- 绿色不能带入仅允许original的新女；切换会拒绝并保原人物，恢复原色后可切。其余原生发肤唇色未放开。原生绿也改变瞳孔深色RGB，不声称每个瞳孔像素不变。
- HTTP固定build与三配色资源字节已核：native-iris-release-cb427-v1。远端已核7d5e283e15fb197ec4d4c69561afedcc12a8bf2d；remote-backup.json记录在该目录（随后纳入下一提交）。

## 当前主工作包：原生真实腰部派生进入共用factory

- Face cc0843已技术接入并发布f583。新脸原三衣、同镜头表达、完整短动作链与关页恢复见native-face-{geometry-room,factory-room}-v1；实际UI/12媒体见native-face-workbench-f583-v1。限制/失败/重建见native-face-release-f583-v1/REVIEW.txt。不是完整M2或任意改脸通过。
- Face独审native-face-factory-independent-v1：3覆盖/4准入/3stage组与实际原mask/骨绑定/鞋底依据通过；旧source slot错误、CRLF漂移保留。body-texture-fit源已恢复9fed字节并--check通过，source包c21a6。root完成stage-native-face-factory.py精确预检与原子写；旧stage残留移至experiments/native-face-failed-stage-20261117未删除或发布。
- 当前源Waist实际SHA cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5（注意历史文字误写，文件SHA为准）。已有原生WaistScaleMag .40→.58生产，不再Studio重做；变化涉及Body/衣物、18附加骨/3IBM/12spring半径。原source/data完整包在native-vroid-geometry-{production,factory-input}-v1。
- asset_budget(sol/high)已初提Waist三衣，正在纠正复制整份提取器的缺口：抽共用纯函数、薄source/spec wrapper，保Face产物byte-identical，Waist仅修过时metadata限制，GLB不变。未写runtime/public，不GPU。
- http_transport_review(sol/high)已native-waist-factory-dependencies-v1，只读依赖；其“1 accessor metadata”不等于实际仅1几何buffer变，实际diff以原native-geometry-production-independent-v1为准。下一步需新体coverage/profile/真实运行，不继承Face fit。
- face_target_feasibility(astra/high)已封Face独审；可接Waist source/装备/coverage独立检查。root负责整合与GPU，勿并行录屏。
- 眉/虹膜/原生长发等既有成果复用。原生发色两次导出未生效已封失败，不能重试同因扫参。封裙/30秒舞不变。

## 下一真实缺口与避免重复

- native-geometry-reuse-review-v1核查：78912→843ac与a18→7586仅Body PNG变化；Joy候选仅表情morph。没有一份与当前基模不同、可直接进入factory的未用原生脸体候选；参数回执不等于参数前后导出几何对照。78912本身源于round-waist制作，不能倒推其未接受参数；缺的是可核的前后VRM证据。
- 后续几何包需一对真实原生参数前后导出与相关fit/coverage/表情读回，不再制作自拟怪异批次。已有源/骨架/装备拆分代码复用，别重复原男女导入。
- 原生独立衣物MToon/名称映射/update(0)、男女性Body原生卸Tops PNG恢复、body-texture-coverage两源所有权均已有证据；源码/源包见CAP相应条，不重做。
- 当前新源双实例原报告native-pair-isolation-193b-v1保failed末段dance，已观察到骨材质装备/椅占用隔离，不算全套通过。浅角度路径恢复已f749修，不重开。
- 自适应关节只到Mink例与VRM FK CPU读回，尚无限位/碰撞短舞优化通过，禁改封30秒舞。

## 工具与性能限制

- Studio2.16 + BepInEx IL2CPP be.791 + mcjo79 Bridge0.15，experiments/tools/vroid-mcp-bridge-0.15.0/app-2.16；7811内部桥。call.py复用assets-source/vroid-bridge-study-v1。froz6469独立lab用于表达/customitem，不取代主桥。
- 女原源311a/VRM78912、男c936/VRMa18及完整皮肤843ac/7586来源保包；组合PNG派生无合并单一.vroid，不能称原生重开派生完整工程。内置素材与原meta许可分开，MCP MIT不扩大素材许可；对外角色生成工具另核官方授权。
- 发型成本native-hair-cost-c272-v1：跨批次12s走/6s坐，RTX4090/9950X3D，独立发updateDynamics约0.2435ms/render，渲染CPU提交约0.669ms，房间142draw/120458tri/56textures；卸载回47textures/83geometries。不是GPU时长/普通机/长期性能结论，保失败原始采样。
- 不使用桌面。2.14已卸载、旧桥关闭；3旧目录删除被自动策略拒绝的约2.09GB残留未清，见vroid-214-retirement-v1，不绕过。
- 派工均复用明确requested配置，实际provider/hook未独立暴露；记录subagent-explicit-dispatch-2026-11-16.json。不从host400推断独审文件不存在，也不称host成功。


最新固定版f583已HTTP核7资源，4196服务由scripts/serve-appearance-workbench.py读取delivery指针；前cd3独立树/指针保留。上次核实远端d707511d，本增量源码1ffe与证据即将备份，备份回执以native-face-release-f583-v1为准。M2长目标继续，未开启M3。
