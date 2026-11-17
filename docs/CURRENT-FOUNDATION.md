# 当前角色工程：恢复入口

2026-11-16，F:/gamemake，feat/m1-foundation-room。先读AGENTS和本页，再读当前包相关CAP/规格/证据；不重读历史全文，不另建状态台账。

## 当前工作包（恢复先看）

主包仍为4女+4男代表预设共同生产。v2只有六个源成功，两lean失败；六个脸部请求仍有明显意图损失，不能称8个成功或M2完成。原v1/v2及全部失败保留。当前正式角色路线Phaser+Three+VRM；女裙和30秒舞封存。

公开4196已更新：source71081be29b5fee7dc5e6d6fbcc17b9b4c65d4b9d / buildf82a7fc6de61，experiments/m2-vest-layer-fixed-v1/prototype/dist。入口delivery/appearance-workbench.json，旧ed2指针delivery/history/appearance-workbench-ed2.json。第二独立检出npm ci/build的376文件逐字节一致；公开真实编辑、移动及12条前后影片播放烟测通过。旧look保留，新look名称“裤装·腰部修订对照”，适用原女/round-full-v2/soft-wide-v2。4196是唯一角色工作台；4174保录像、4195保M1。

当前可看：/evidence/m2-vest-layer-review-f82-v1/（4174），三体×房间/近腰六对原始完整1×。新候选换装/base恢复/旧ed2配方读取/新配方重载/快速请求最终状态证据m2-vest-layer-outfit-f82-v1。root已看18近腰2fps表+3坐姿原图，batch_v2_readback已看18房间表+9原图；各图SHA在close/room-visual-review.json。原大块腹前露面在采样中不再出现；原上衣鼓胀/方折、脸型与马尾椅背硬弯仍保留，连续人类视觉待验。半身不可判全足底。6段旧新影片身份不改标，不能用数值零外推无穿模。

层间修复是资产适配和装备依赖，未改6个共用动作控制器。源m2-vest-layer-fit-v1+body-coverage-v1，publisher新增13文件；真实top/pants身份和fit/mask精确绑定。原女错误bottom编号已在4771fd58修正，原失败留history。运行独审m2-vest-layer-runtime-review-v1：附加目录/依赖/普通race通过；发现旧childadded同步dispose漏洞并在71081be修，长期回归scripts/qa-equipment-attach-dispose.mjs，修前后失败/成功均保。publication独审已合1de8595e。普通电脑未测，f82的开发机短测不冒认目标机。

头部方法：整身cage与head-only原8失败已封存（head主树4a0a52c0/独审908bc74c）；正式strict门仍拒绝，没有生产/游戏准入。完整response已一次提取并合820fbd28：原男女各27个2mmprobe、完整606×27响应，4.27s/RSS232.57MB、identity前后0、跨轴0。root用它回算原8失败coeff，最大逐坐标差1.069–9.248µm，仅原202附着点；evidence/m2-head-response-linearity-v1。原八LP已合afae69eb/b094d9af，修域后的同条件八LP已合25bb0938/627cde52，均8/8 status2(proxy-infeasible)，无primal/t/解残差。新独立几何审阅明确：固定源边202点逐XYZ±2mm是额外代理条件，并非正式requestedY的101截面半宽≤2mm的必要条件（极值边和交点可换）。因此这些结果不能证明原正式门、甚至同一cage正式门无解。停止继续形状试验依据为实际失败和预算；不得将LP夸成不可能性证明。

新根因与刚完成的窄包：domain-audit确认原内嵌Tops_01_CLOTH袖点被Head.all_endpoints纳入，将bbox宽撑至女.54977/男.59887m；实际引用Body_SKIN+Face_SKIN+FaceMouth（含brow）端点加原20mm为.20820/.21252m。最初tuple成员判断误报unused已被推翻，实际索引全覆盖，不按误判删数据。skin-domain源已合cd639b1b（作者23d93449），只修bounds语义输入，逐原端点identity0/必要点outside0后一次两性response；原weights/保护/27controls/请求/body不改。独审m2-head-cage-skin-domain-audit-v1无新增阻断。新LP仍只拒附着点代理，未生成新形状。本cage尝试在预算处封存，不扫padding/ridge/cap；正式det/表达/实际半宽门保持。

当前接续：官方libigl2.6.3独立venv的单tet smoke通过；不改全局Python。source/evidence在m2-slim-tool-smoke-v1，原始所有许可证/二进制SHA固定。identity误差0、1mm五步残差1.668nm；仅全4点软约束API证明，完整solver峰RSS未测。target-contract包完成两源/八请求/808正式截面，root实际build.py --check通过。几何审查明确23原顶点软guide回插原202点误差最高0.942mm，不是实际截面通过。

一次male体积域前置已实际完成：scripts与assets-source/m2-head-volume-domain-v1，5742节点/37114tet，113713选中base/表达occurrences，控制缺失0、zero tet0、越界0，identity1.164e-15m/affine1.111e-15m；1.64秒、进程树采样RSS152326144字节。只数学接口；cond最大4.386e9/minvolume4.815e-17存在薄单元风险。域独审27项通过。一次原生SLIM已运行：identity全nodes0误差；lean+round各20步均failed，min det .004335/.001966、保护偏移.411/2.210mm、正式半宽误差13.943/15.780mm，lean缺7切面。总15.57秒/树采样934MB。原报告np.bool_异常exit2，raw齐全；唯一recover_readback.py从raw恢复两份报告，无重求解且原SHA全同。独立根因已固定evidence/m2-head-volume-slim-diagnosis-v1：坏tet非最薄，固定HairBack+含Joy的Eyeline/EyeExtra与guide目标在同一tet冲突，保持保护平面需偏离guide6.77–9.29mm；不证明真实截面无解。新包m2-head-attachment-slim-v1已唯一执行并封存33文件：1343固定/3104随动、1374控制/4368free，分类独审30项通过。identity全nodes0；lean/round各20步一次，min det .223621/.206280、fixed端点24.058nm/397.729nm及Float32拟烘焙通过；101正式半宽最大误差9.379861/2.638866mm，缺段0，两项failed-not-admissible。16.577s/树采样RSS1007165440B，exit0，无重试。root核33文件SHA/字节数一致。后验入口m2-head-attachment-readback-v1准备完成，8项合成QA由root独立临时目录复跑一致，未读失败候选数组/未跑真实55帧后验，无VRM导出。root初算23guide已命中约82nm/1.54um，尚待只读极值见证复核落盘；不能以guide命中替代截面通过。下一项由astra/high定位真实极值三角、原23guide及z筛选关系；sol/high查成熟可执行轮廓约束，不先新造算法、不扫参。4196保持f82，八预设未完成。

动作自适应已完成方法调研research/MOTION-CONTACT-ADAPTATION-OPTIONS-2026-11-16.md（R2ET/Mink/CAMR源码/许可/限制）。Mink只是离线小试优先候选，未安装求解器/未完成VRM往返/无通用避碰通过；不插入本八体包准入，不重开封存舞。新机制必须先核可复用官方/原作者实现及实际输入输出再小试。

f82固定候选已核远备d39bd253c0bacc20a5b0fcd31062163291ec7060；后续head失败/独审/研究已核d3d7f8a5b64a32efb7f7a48332075e14e00ca277，两次push后均ls-remote精确一致。回执分别在m2-vest-layer-review-f82-v1和m2-head-cage-diagnostic-independent-v1；其后response/LP与域审查尚待再备，不冒认已覆盖。当前HEAD实际用git核。公司副总工相关dirty/untracked不动、不stage。

## 当前授权与边界

完整功能/验收：research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt，SHA256 `309ae27289e81689d26a08f2704e887a9a882befad860e534f0779445efedc23`。已按用户新短版执行指令核全文：CAP唯一事实，FOUNDATION-MILESTONES只安排P0–P6顺序/退出条件。一次一个主工作包，按机制选最少样件，子包完成继续。两轮同因无改善先重定位。所有必需能力完成后提交用户确认，确认前不进入M3。

Phaser+Three+VRM保留；女性封板裙和30秒舞不再精修。普通电脑无测试设备，记录缺口继续独立任务。确定性角色记录/批处理是M2，随机策略/扩量/游戏业务仍M3。具体人物审美与房间辨识度不阻塞技术制作。

## 恢复与协作边界

- 当前有界代理：face_target_feasibility=gpt-6-astra/high，m2-head-attachment-silhouette-diagnosis-v1只读极值见证；asset_budget=gpt-6.1-sol/high，m2-head-silhouette-method-review-v1成熟接口核查；http_transport_review=gpt-6.1-sol/high后验准备已完成。requested配置明确，真实provider与桌面hook拦截未独立核验。
- 角色侧GPU/录像/重导出窗口空闲，本包仅CPU。公司钟表source93e13399/build5c1451b072ae正常速度61.60秒录制已结束并释放窗口；其scene.setPresentationInputs({clockSeconds})及独立交付F:/gamemake-company-clock-delivery-5c1属公司侧声明，尚未核角色集成，不改本角色CAP为已通过。
- 下一项：精确定位guide准确但真实截面失败的几何原因，研究可复用共同目标表达，再决定最小一次试验；本两项预算已用完，不能重跑。没有数值准入就不跑后验/不导出。最新已核远备f9615a3f52b0e483e264efc2ff8a7903d27ecb05；新附件语义及后验准备待备。公司dirty/untracked不动，M2未完成，不进入M3。
- 固定交付按exact commit独立检出；录像与构建身份保持，旧failed不改标。只stage明确路径，不git add -A。公司平台副总工独立交付，未核的CAP-INCREMENT不当本角色集成通过。
- docs/HANDOFF.md为恢复规则；完整范围见现行v2，生产索引scripts/production/和assets-source保输入/工具/许可/失败，不以目录存在当通过。
