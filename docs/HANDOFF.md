# 项目交接

恢复先读AGENTS.md和CURRENT-FOUNDATION.md，然后读当前工作包的CAPABILITIES条目、FOUNDATION-MILESTONES退出条件和实际证据。CAP是唯一能力事实，历史报告不是新待办。

- F:/gamemake / feat/m1-foundation-room；baseline不动，prototype是新建工程而非遗失源码恢复。
- 当前M2以research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt完整范围及后续用户决定为准。一个主包闭环后继续；M2必需项未齐不能宣告完成，用户确认前不开M3。
- Phaser+Three.js+VRM；封板女裙与30秒舞不再精修。普通电脑缺设备实测，不以开发机代替，不阻塞其他任务。
- 最新公开入口/候选/源码/录像/备份/主包与阻塞只查CURRENT及delivery指针，不复制旧版本流水。旧证据保原身份。
- 当前是在GPT桌面中的Codex，不是Codex CLI。派工显式配置与桌面hook强制执行分开，后者仍未验证。具体派工记录evidence/subagent-explicit-dispatch-2026-11-16.json。
- 用户负责产品与观看，agent负责专业制作和验证；不因审美选型或远景差异暂停技术工作，不把有限资源兼容外推为任意模型自动适配。
- 一次一个GPU/录像/重导出任务；固定产物从确切提交独立检出构建，备份核对远端SHA。禁止给旧证据换新构建标签。


## 2026-11-17 云端团队移交衔接回执

此回执供顾问/回归团队读取，不授权接管主分支，不进入M3，不复制整个experiments或本机环境。正式入口、source/build和远端核验始终见CURRENT-FOUNDATION与delivery/appearance-workbench.json；当次64c固定源码2c0f1428，f3d录屏不改标签。

- 已验可复用：当前共享角色加载/装备/动作与时间/任务/座位租约；旧M1代表男女和冻结动作；原生四体精确麦克风/眼镜与四目标舞蹈；两原生体完整记录同体/跨体恢复和失败保旧。真实范围逐项查CAP，不继承旧体所有衣物/毛发/配色与fit。
- 当前在制/未齐：D01引用身份尚非完整传递资源包，P03仅旧801两套受限包；D03确定性批处理/独立消费未完成。CAP的身体/脸部/毛发/表面/服装结构/鞋底/附属与双手功能持物等未齐机制仍属M2。普通机实测缺设备；最终风格未定。不得把原生按钮接通说成完整M2。
- 公司C3：docs/CHARACTER-COMPANY-C3-SEAM-2026-11-16.md是接口依据。角色侧尚未独立联调公司报告891d9305/build1c3。公司拥有modules/config/resources；main/人物控制/任务/租约由角色侧集成，不合并公司旧main，不另建动作时钟或占用表。文件中副总工未提交改动不纳入本次角色提交。
- 构建锁版本：当前实跑Node24.13.0、npm11.6.2；prototype/package-lock.json锁Phaser3.90.0、Three0.187.0、three-vrm3.5.5、Vite7.3.8、Playwright1.58.2。Node22+为既有脚本最低说明，Linux在本轮未实测。
- 云Linux无GPU可先做独立源码检出、prototype内npm ci与npm run build、根目录node scripts/test-character-record.mjs；生产流程索引使用python scripts/production/flow.py（具体子命令见PRODUCTION-FLOW-CLI）；可读资源hash/manifest、CPU合同与打包器研究。qa-whole-look等依赖夹具和加载器，按脚本明确参数，不把浏览器/GLSL/录像测试称无GPU通过。
- Windows/GUI与渲染依赖：VRoid Studio2.16+BepInEx/MCP制作/保存/VRM原生导出按assets-source相应toolchain与源流程；有些导出步骤仍需GUI，不能把云无桌面当已支持。既有Blender4.5.9LTS+VRM addon4.10.5流程按各自固定脚本与spec；Blender理论可headless不代表当前Windows路径脚本已移植Linux。Chrome157实测影片来自开发RTX4090机器，不代表普通设备或云软件渲染。
- 最小运行：检出确切source，cd prototype后npm ci、npm run build；临时查看可npx vite preview --host 127.0.0.1 --port 4196 --strictPort，不能在本机已占4196时另起。Windows当前公开服务用根目录python scripts/serve-appearance-workbench.py，读取已验证delivery指针。qa-fixed-rebuild.py会生成本地独立检出/报告；跨平台细节须云端实际验证。
- 应带：确切提交源码、package锁、prototype/public所需运行资源、assets-source中所选源/spec/许可与tools记录、对应scripts导出处理器、docs合同、delivery固定清单与所选证据目录。原生完整源及动作来源的授权逐项核对；源码仓库可见不等于给所有第三方素材新增再分发授权。gitignore掉的临时原料不能假定在新检出中存在；缺失时按清单报具体路径。
- 不随包：凭据/.env私密配置、登录会话、个人浏览器资料、用户桌面文件、整个node_modules、整个experiments、无授权工具安装包和其他项目。不得改仓库权限。只按已有许可移交指定资产。
- 建议独立云端任务：只读资源依赖与许可完整性审查；新检出CPU构建复验与路径可移植修复（独立分支）；围绕现有角色记录扩展P03清单/失败定位。保留本地：真实VRoid制作与必要桌面导出、单GPU游戏录屏、最终集成与4196固定发布、用户观感验收。团队并行任务需显式模型/思考深度及文件归属，不能共同修改main。


## 云端玩法／二维素材接缝补充（2026-11-17）

顾问两次通知已读取，本条仅确认现有合同，不启动服务器、公司重构或M3，也未向其他聊天发送消息。角色稳定身份是 character-record.identity.id；room-primary/peer 是当前场景执行者标识，不能冒充持久主播ID。最终造型、装备/fit版本和资源SHA按现有record保存；收益、交易和PK不能由动作完成回调、播放速度或当前可见状态结算。行为requestId及completed/cancelled/failed供表现调度，不是业务账本。

外部图像必须区分参考图和可加载贴图。贴图至少随资源保存用途/装备或身体ID及版本、源文件/许可、像素尺寸/格式/色彩空间、UV或对应原贴图身份、区域遮罩/通道语义、处理脚本及参数、输出SHA和适用材质/透明规则。并非所有贴图必须经VRoid：既有合格UV/材质链可用已验证离线处理脚本；涉及原生VRoid源与遮罩的样件继续该源链。自由绘制图片只有参考用途，未经UV/遮罩/材质及实际回读验证不能登记成可用人物贴图。既有身体/脸/眼/衣色规则见当前appearance/material合同，不新造云端协议。

顾问报告的Debian公司小包验证尚属对方回执；角色工程未独立复验、未合并其main，也未把SwiftShader记为普通电脑通过。当前P03角色运行资源包独立推进，不派云端重复制作。


2026-11-17 D03接续：固定工作台65814（d09c7b03）与独立四记录运行包已实际验证。最新短恢复点为CURRENT-FOUNDATION，接口说明CHARACTER-RECORD-CONSUMER，唯一能力事实CAP。新原生人物导入不等于贴图替换；旧麦克风/眼镜缺口已补并实际4196再次核，不把任何新体加载视作自动继承全部能力。后续D02仍用共用资源准入与记录事务，M2未结束。公司分支文件未纳入本包。
