# 当前角色工程：恢复入口

2026-11-16，F:/gamemake，feat/m1-foundation-room。先读AGENTS和本页，再读当前包相关CAP/规格/证据；不重读历史全文，不另建状态台账。

## 当前工作包（恢复先看）

主包仍为4女+4男代表预设共同生产。v2只有六个源成功，两lean失败；六个脸部请求仍有明显意图损失，不能称8个成功或M2完成。原v1/v2及全部失败保留。当前正式角色路线Phaser+Three+VRM；女裙和30秒舞封存。

公开4196已更新：source71081be29b5fee7dc5e6d6fbcc17b9b4c65d4b9d / buildf82a7fc6de61，experiments/m2-vest-layer-fixed-v1/prototype/dist。入口delivery/appearance-workbench.json，旧ed2指针delivery/history/appearance-workbench-ed2.json。第二独立检出npm ci/build的376文件逐字节一致；公开真实编辑、移动及12条前后影片播放烟测通过。旧look保留，新look名称“裤装·腰部修订对照”，适用原女/round-full-v2/soft-wide-v2。4196是唯一角色工作台；4174保录像、4195保M1。

当前可看：/evidence/m2-vest-layer-review-f82-v1/（4174），三体×房间/近腰六对原始完整1×。新候选换装/base恢复/旧ed2配方读取/新配方重载/快速请求最终状态证据m2-vest-layer-outfit-f82-v1。root已看18近腰2fps表+3坐姿原图，batch_v2_readback已看18房间表+9原图；各图SHA在close/room-visual-review.json。原大块腹前露面在采样中不再出现；原上衣鼓胀/方折、脸型与马尾椅背硬弯仍保留，连续人类视觉待验。半身不可判全足底。6段旧新影片身份不改标，不能用数值零外推无穿模。

层间修复是资产适配和装备依赖，未改6个共用动作控制器。源m2-vest-layer-fit-v1+body-coverage-v1，publisher新增13文件；真实top/pants身份和fit/mask精确绑定。原女错误bottom编号已在4771fd58修正，原失败留history。运行独审m2-vest-layer-runtime-review-v1：附加目录/依赖/普通race通过；发现旧childadded同步dispose漏洞并在71081be修，长期回归scripts/qa-equipment-attach-dispose.mjs，修前后失败/成功均保。publication独审已合1de8595e。普通电脑未测，f82的开发机短测不冒认目标机。

头部方法：整身cage已封存失败，不能重跑。head-only源62f80c7c的正式strict预检仍拒绝；独审判口内纳米pair数值边界不确定。经明确隔离的diagnostic-only入口，原8请求一次批次现已完成且8/8均failed：负det、实际半宽误差11.56–47.17mm和新增strict表达pair。没有生产准入/游戏发布。asset_budget正封存隔离树F:/gamemake-representative-head-cage的diagnostic-v1源与产物；http_transport_review正独立CPU核负det/响应拟合/保护场根因。禁止继续扫参、改门或静默将诊断变成成功。下一步收其提交/独审，依据新证据选一条共同修正或替代方法；无新根因不再导出。

动作自适应已完成方法调研research/MOTION-CONTACT-ADAPTATION-OPTIONS-2026-11-16.md（R2ET/Mink/CAMR源码/许可/限制）。Mink只是离线小试优先候选，未安装求解器/未完成VRM往返/无通用避碰通过；不插入本八体包准入，不重开封存舞。新机制必须先核可复用官方/原作者实现及实际输入输出再小试。

最新已核远备仍ec99825cf3de629ba5ebc30839a22b8972fe43b6；其后的f82源码、覆盖源及本轮证据正收尾提交备份，未核远端前不称成功。当前HEAD实际用git核。公司副总工相关dirty/untracked不动、不stage。

## 当前授权与边界

完整功能/验收：research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt，SHA256 `309ae27289e81689d26a08f2704e887a9a882befad860e534f0779445efedc23`。已按用户新短版执行指令核全文：CAP唯一事实，FOUNDATION-MILESTONES只安排P0–P6顺序/退出条件。一次一个主工作包，按机制选最少样件，子包完成继续。两轮同因无改善先重定位。所有必需能力完成后提交用户确认，确认前不进入M3。

Phaser+Three+VRM保留；女性封板裙和30秒舞不再精修。普通电脑无测试设备，记录缺口继续独立任务。确定性角色记录/批处理是M2，随机策略/扩量/游戏业务仍M3。具体人物审美与房间辨识度不阻塞技术制作。

## 恢复与协作边界

- 当前有界代理：asset_budget与http_transport_review均复用已明确请求gpt-6.1-sol/high，前者封存一次head诊断，后者独审共同失败原因；batch_v2_readback已完成房间审图。真实provider配置和桌面hook拦截未独立核验，不冒认。
- 单GPU/录像/编码/重导出窗口当前空闲。f82六片、公开烟测和第二独立构建已结束，不因压缩恢复而重录。CPU文档/源码诊断可并行；没有根因依据不再触发head导出。
- 下一项：完成本轮固定候选证据和远备；收head-only失败封存与独审，选有证据的下一窄包，持续推进完整M2。M2未完，不进入M3。
- 固定交付按exact commit独立检出；录像与构建身份保持，旧failed不改标。只stage明确路径，不git add -A。公司平台副总工独立交付，未核的CAP-INCREMENT不当本角色集成通过。
- docs/HANDOFF.md为恢复规则；完整范围见现行v2，生产索引scripts/production/和assets-source保输入/工具/许可/失败，不以目录存在当通过。
