# 当前角色工程：恢复入口

2026-11-16，F:/gamemake，feat/m1-foundation-room。先读AGENTS和本页，再读当前包相关CAP/规格/证据；不重读历史全文，不另建状态台账。

## 当前工作包（恢复先看）

主包仍为4女+4男代表预设共同生产。v2只有六个源成功，两lean失败；六个脸部请求仍有明显意图损失，不能称8个成功或M2完成。原v1/v2及全部失败保留。当前正式角色路线Phaser+Three+VRM；女裙和30秒舞封存。

公开4196已更新：source71081be29b5fee7dc5e6d6fbcc17b9b4c65d4b9d / buildf82a7fc6de61，experiments/m2-vest-layer-fixed-v1/prototype/dist。入口delivery/appearance-workbench.json，旧ed2指针delivery/history/appearance-workbench-ed2.json。第二独立检出npm ci/build的376文件逐字节一致；公开真实编辑、移动及12条前后影片播放烟测通过。旧look保留，新look名称“裤装·腰部修订对照”，适用原女/round-full-v2/soft-wide-v2。4196是唯一角色工作台；4174保录像、4195保M1。

当前可看：/evidence/m2-vest-layer-review-f82-v1/（4174），三体×房间/近腰六对原始完整1×。新候选换装/base恢复/旧ed2配方读取/新配方重载/快速请求最终状态证据m2-vest-layer-outfit-f82-v1。root已看18近腰2fps表+3坐姿原图，batch_v2_readback已看18房间表+9原图；各图SHA在close/room-visual-review.json。原大块腹前露面在采样中不再出现；原上衣鼓胀/方折、脸型与马尾椅背硬弯仍保留，连续人类视觉待验。半身不可判全足底。6段旧新影片身份不改标，不能用数值零外推无穿模。

层间修复是资产适配和装备依赖，未改6个共用动作控制器。源m2-vest-layer-fit-v1+body-coverage-v1，publisher新增13文件；真实top/pants身份和fit/mask精确绑定。原女错误bottom编号已在4771fd58修正，原失败留history。运行独审m2-vest-layer-runtime-review-v1：附加目录/依赖/普通race通过；发现旧childadded同步dispose漏洞并在71081be修，长期回归scripts/qa-equipment-attach-dispose.mjs，修前后失败/成功均保。publication独审已合1de8595e。普通电脑未测，f82的开发机短测不冒认目标机。

头部方法：整身cage与head-only原8失败已封存（head主树4a0a52c0/独审908bc74c）；正式strict门仍拒绝，没有生产/游戏准入。完整response已一次提取并合820fbd28：原男女各27个2mmprobe、完整606×27响应，4.27s/RSS232.57MB、identity前后0、跨轴0。root用它回算原8失败coeff，最大逐坐标差1.069–9.248µm，仅原202附着点；evidence/m2-head-response-linearity-v1。原八LP已合afae69eb/b094d9af，修域后的同条件八LP已合25bb0938/627cde52，均8/8 status2(proxy-infeasible)，无primal/t/解残差。新独立几何审阅明确：固定源边202点逐XYZ±2mm是额外代理条件，并非正式requestedY的101截面半宽≤2mm的必要条件（极值边和交点可换）。因此这些结果不能证明原正式门、甚至同一cage正式门无解。停止继续形状试验依据为实际失败和预算；不得将LP夸成不可能性证明。

新根因与刚完成的窄包：domain-audit确认原内嵌Tops_01_CLOTH袖点被Head.all_endpoints纳入，将bbox宽撑至女.54977/男.59887m；实际引用Body_SKIN+Face_SKIN+FaceMouth（含brow）端点加原20mm为.20820/.21252m。最初tuple成员判断误报unused已被推翻，实际索引全覆盖，不按误判删数据。skin-domain源已合cd639b1b（作者23d93449），只修bounds语义输入，逐原端点identity0/必要点outside0后一次两性response；原weights/保护/27controls/请求/body不改。独审m2-head-cage-skin-domain-audit-v1无新增阻断。新LP仍只拒附着点代理，未生成新形状。本cage尝试在预算处封存，不扫padding/ridge/cap；正式det/表达/实际半宽门保持。

下一主包为目标表达与成熟工具接入的有界研究，未批准人物形状批次。官方入口核查完成后，已授权一次独立venv的libigl 2.6.3单tet API smoke，不改全局Python；实际结果待回读。face_target_feasibility新派明确gpt-6-astra/high，核几何目标/保护相容性并给下一最小验证；asset_budget复用gpt-6.1-sol/high，核已有libigl SLIM研究的实际Windows/API/工具可用性，不重复调研或安装。几何顾问已区分软guide和真实截面门，并发现23个源顶点可提供有量化误差的原生顶点软引导；具体附录待核。http_transport_review复用sol/high生成机器可读target-contract，不作求解。先验证工具/目标接口，未开始新八体导出。当前M2八预设仍未完成，已有六体技术候选保留。

动作自适应已完成方法调研research/MOTION-CONTACT-ADAPTATION-OPTIONS-2026-11-16.md（R2ET/Mink/CAMR源码/许可/限制）。Mink只是离线小试优先候选，未安装求解器/未完成VRM往返/无通用避碰通过；不插入本八体包准入，不重开封存舞。新机制必须先核可复用官方/原作者实现及实际输入输出再小试。

f82固定候选已核远备d39bd253c0bacc20a5b0fcd31062163291ec7060；后续head失败/独审/研究已核d3d7f8a5b64a32efb7f7a48332075e14e00ca277，两次push后均ls-remote精确一致。回执分别在m2-vest-layer-review-f82-v1和m2-head-cage-diagnostic-independent-v1；其后response/LP与域审查尚待再备，不冒认已覆盖。当前HEAD实际用git核。公司副总工相关dirty/untracked不动、不stage。

## 当前授权与边界

完整功能/验收：research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt，SHA256 `309ae27289e81689d26a08f2704e887a9a882befad860e534f0779445efedc23`。已按用户新短版执行指令核全文：CAP唯一事实，FOUNDATION-MILESTONES只安排P0–P6顺序/退出条件。一次一个主工作包，按机制选最少样件，子包完成继续。两轮同因无改善先重定位。所有必需能力完成后提交用户确认，确认前不进入M3。

Phaser+Three+VRM保留；女性封板裙和30秒舞不再精修。普通电脑无测试设备，记录缺口继续独立任务。确定性角色记录/批处理是M2，随机策略/扩量/游戏业务仍M3。具体人物审美与房间辨识度不阻塞技术制作。

## 恢复与协作边界

- 当前有界代理：face_target_feasibility=gpt-6-astra/high，asset_budget=gpt-6.1-sol/high，均只读研究；http_transport_review与batch_v2_readback此前独审/LP已完成。requested配置明确，真实provider与桌面hook拦截未独立核验；新spawn成功不等于gate已证。
- 角色侧单GPU/录像/编码/重导出窗口目前空闲，source修域probe与f82公开按钮检查均结束。已收到公司副总工多层承载4b3/source300e9及柜门940/source84ef交接，尚未核整合、不改CAP为角色已验。公司副总工已通知74.48秒柜门录像结束并释放窗口；该包仍为其声明，未核角色集成。角色侧本包仅CPU/隔离工具，无GPU或录制作业。
- 下一项：收几何目标顾问与SLIM工具可执行性结论，选择单条可重现最小验证，不再盲试旧cage。固定4196=f82保持。最新已核远备d3d7f8a5，之后响应/LP/域与UI证据仍待再备。M2未完，不进入M3。
- 固定交付按exact commit独立检出；录像与构建身份保持，旧failed不改标。只stage明确路径，不git add -A。公司平台副总工独立交付，未核的CAP-INCREMENT不当本角色集成通过。
- docs/HANDOFF.md为恢复规则；完整范围见现行v2，生产索引scripts/production/和assets-source保输入/工具/许可/失败，不以目录存在当通过。
