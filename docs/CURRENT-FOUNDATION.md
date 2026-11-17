# 当前角色基础工程恢复点

## 固定入口与备份
- F:/gamemake / feat/m1-foundation-room。4196 build 65814ccb92c2，source d09c7b0300838d2632fb63674a7a9a9d4d92bb78；独立experiments/m2-record-consumer-release-v1/prototype/dist。delivery/appearance-workbench.json；回退7a03指针在delivery/history。4174历史证据、4195封存M1，不加常驻端口。
- 本D03发布增量10ad2c3a4d44e458727f51b349a164f1f54ffcae已推送并经git ls-remote核与HEAD一致。公司副总工dirty文件不stage，不用git add -A。

## 刚完成D03限定主包
- character-record-consumer共用factory/motions/record，不读工作台DOM/草稿/制作机工具。先场景外准备完整造型再attach；game拥有时钟/位置/行为。独立入口record-consumer.html已链接4196检查→原生制作→完整记录，实际public-v1点击回归通过（原生女改脸、原生男、旧男麦克风眼镜）。
- 四份固定最终记录：原生女改脸/男、同女体另一ID、旧男材质短裤。两人一组，实际503保先成功实例+只重试失败项、同体骨架/道具隔离、坏版本/hash、挂起加载取消、关闭恢复过；m2-record-consumer-fixed-v1有两段8.5秒1×讲话、全时段2fps辅助帧，人工观感不代判；不是新增路径/椅子实现。
- character-record-batch逐项身份/修订/SHA与完成/失败/取消，maxConcurrency1默认/最多2。消费回调成功也带绑定本候选的release，处理fulfilled后取消窗口。独审修不可克隆单行不中断其他人，7CPU项；consumer.capture基于原记录生成候选下一修订，不自动保存或改绑定。
- 源d09c精确检出npm ci/build；m2-record-consumer-rebuild-v1另新检出457文件逐字一致，git干净。不能从共享源码冻结。
- scripts/runtime-package/game-record-cli.mjs为独立新适配器，game-record-runtime-reviewed.json钉d09c/build65814。旧801和7a03适配器pin不动。四记录union闭包，experiments/m2-game-record-package-v1有51声明文件+包manifest（约95.7MB声明字节非内存）。包不含工作台index；m2-game-record-package-browser-v1实际运行同一套回归已过。
- 独立导出CPU5项+collector7项与审查：正式CLI使用仓库审定表，外部副本须完全相同。清单同目录临时写完硬链接原子新建，ENOSPC/并发重试保旧，要求文件系统支持hardlink，失败明确返回。审查证据m2-game-record-package-review-v1；没有新压缩/授权/性能结论。
- 前包整套材质记录与三个选定包已有效保留：7a03/eb40证据m2-character-material-fixed-v1、m2-record-transfer-v2；其旧包有room DOM限制，D03新包另列，不能改历史标签。

## 下一主包与边界
- 下一共同缺口D02：核现有生产索引/appearance-candidates/character-record-store的完整记录查询、修改、生成合法组合入口，复用现有事务与真实原生适配；当前只具文件list/validate及UI捕获，不能冒称完整agent CLI。先读CAP对应D02/L01/P03与v2相关段，不重读全历史。M2未完成，不进随机M3。
- 用户问新增两皮肤为何丢功能：已据实际源说明是整个人物VRM（体/脸/绑定/衣），不是仅贴图；把候选过早放菜单而遗漏握麦/眼镜是接入交付缺口。当前四native已补接，最新实际4196再次核女face/男，不能外推其他外观fit。
- 女裙与原30秒舞封板不再调，普通电脑没有设备继续记未实测。开发机9950X3D/4090/Chrome157不等于目标机。统一制作的来源/资产ID/适配/许可沿既有合同。
- 本轮只脚本和后台Playwright，不占桌面；单GPU录屏。子agent已回：deterministic_record_batch(astra/high)、material_record_review(astra/high)、game_record_package(sol/high)，请求配置与适配理由已记，实际provider/hook拦截未证明。
- 公司平台由副总工负责，保其dirty文件，顾问云端接缝回执已在HANDOFF，不主动外发消息或合并公司main。

当前D02独立任务：deterministic_record_batch（已知astra/high）在核现有store薄CLI的import/read/export，实际资源仍pending，文件边界scripts/character-record-transport.mjs及tests；root接真实浏览器查询/修改闭环。不得把文件校验当运行准入完成。
