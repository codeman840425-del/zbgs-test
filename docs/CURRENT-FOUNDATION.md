# 当前角色基础工程恢复点

## 固定入口与备份
- F:/gamemake / feat/m1-foundation-room。4196 build1084ddeae27a，source55d363fbb2fae96e3b2e571a4f00de825545f537；独立experiments/m2-production-release-v2/prototype/dist。delivery/appearance-workbench.json；回退65814指针在delivery/history。4174历史证据、4195封存M1，不加常驻端口。
- 前D03已核远端879068bc9c1cc360166bcf103d9e09ad9a4bde6f；当前D02收尾提交和远端核验正在做，完成后补本条。公司副总工dirty文件不stage，不用git add -A。

## 刚完成D02限定主包
- source55d363/build1084固定；character-production query/create/edit/validate使用真实factory/事务/完整记录，候选在场景外准备，失败不动当前角色。CLI scripts/character-production-cli.cjs后台浏览器，不占桌面；输出必须显式新路径且不在evidence目录，关闭/证据成功后才原子发布。
- m2-production-fixed-v2是实际分进程原生男query/create/edit、原生女face create及真实二次consumer回读，6秒1×；transport沿旧锁/CAS import/read/export，原男rev1→2保持identity/provenance，结果在results。docs/PRODUCTION-FLOW-CLI说明请求和回读方式，flow.py仍只读索引，不混淆。
- m2-production-guards-fixed-v2实际坏字段/后域失败保原/取消挂起加载/材质复位通过。m2-production-room-{male,female}-v2各约17秒1×走路坐起离椅，动作后完整造型一致；root检查全时段2fps，头发入座外扬保留，未代判完整人工自然度。
- 独立包支持明确1–4记录JSON数组，不改控制器/不重新编译；game-record-production-runtime-reviewed.json只新增新pin，旧65814/7a03/801保持。experiments/m2-production-game-package-v1为50文件包；输入和逐文件证据m2-production-package-fixed-v1。入口record-consumer.html?records=/records/manifest.json，最多双实例。
- m2-production-package-browser-v3实际两记录完整恢复/关闭重开/1×影片与坏manifest无fallback通过。v1 QA漏await、v2路由glob误匹配HTML query保留DIAGNOSIS，runtime未因此修改。dev-room旧-0对JSON0比较失败保留。
- m2-production-rebuild-v2新检出npm ci/build全部字节一致；m2-production-release-ui-v2和public-v2真实4196原生女face/男/旧男mic/glasses按钮及记录入口通过。观看http://127.0.0.1:4196/native-production.html，汇总影片http://127.0.0.1:4174/evidence/m2-production-fixed-v2/。

## 当前下一主包与边界
- P04：把现成完整记录collector与asset_budget/selected_look_budget连接，量当前原生男女含头发/道具/独立纹理和旧材质记录，拒绝不能计量的格式；静态估算不是普通机实测。game_record_package已按已知sol/high接此CPU包，文件边界scripts/production/record_budget*、可新scripts/runtime-package/record-budget-input.mjs与evidence/m2-record-budget-v1，禁止改运行时。root负责复核及真实浏览器加载成本/释放对照。M2剩余独立外观/装备仍在CAP，不能宣称完成或进M3。
- 用户问两皮肤为何丢功能：实际输入整个人物VRM；遗漏精确握姿/镜腿是我们接入交付缺口，不能作为合理免责。四native已补接，当前UI回归确认，其他功能仍按query实际登记，不继承旧体通过。
- 女裙和原30秒舞封板；普通电脑没有设备继续标未测，开发9950X3D/4090/Chrome不代表普通机。此轮未新造形体/压缩/公司/服务器。
- 后台脚本与Playwright；GPU录制一次一个。可继续复用的已知子agent：game_record_package(sol/high)、material_record_review(astra/high)、deterministic_record_batch(astra/high)。实际provider与hook interception未证明，不声称已强制拦截。
- 公司平台由副总工负责；保留其dirty文件。不主动外发消息或合并公司main。
