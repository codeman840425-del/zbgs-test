# 按实际引用顶点缩小 Face 编辑范围（未构建性能候选）

只修改 facial-geometry.apply 的克隆/预备对象选择，以及其必须配套的 foundation 单实例预备缓存。没有改原源、recipe身份、normal算法/阈值、形变参数、表达控制、裙舞或发布入口。CPU通过不等于性能或视觉改善。

## 基线和机制

baseline-* 保存修改前两模块与profile字节，baseline-pins.json记录SHA。1188已证明主program在compile完成后仍首次infoLog同步阻塞、shadow未预备；本候选不关闭诊断、不加first-use/离屏draw、不改Three，只减少无需新NORMAL morph的primitive。

对每次嘴/眉/鼻/眼组合，从实际POSITION变化点和NORMAL affected邻域取union，用每个record真实index筛选，不按材质名。活动primitive仍共用原完整Face求值缓冲，旧算法逐字节不变；不活动primitive回到原geometry引用。提交前只预备活动parts，原已克隆但本次不活动的mesh在同步commit恢复原geometry，随后仅dispose旧owned克隆。取消/失败不提交；reset/dispose恢复原引用。

两种表示必须区分：不活动primitive仍持有原来的全Face数组，数组内未被其index引用的分量可不同于旧“全部clone”结果；其可渲染的所有引用位置/法线及所有expression delta严格一致，不宣称全buffer或源文件字节一致。实际源/recipe完全未改。

## CPU实证

cpu-1/report.json：原女29组、原男29组（含24组合和嘴→眼→眉→重叠→0切换），男jaw2态。对活动primitive完整所有attributes/morph缓冲hash严格相等；跳过primitive原geometry身份不变，实际所有index的base和全部56/54相对POSITION/NORMAL逐分量严格相同，缺NORMAL按0解释。共82,828,740引用分量；另核非平凡混合、UV/skin/index、morph influences引用、实际形态bounds。源保护原buffers未写。

跳过观察684次，其中594次全POSITION表示与旧不同、530次全NORMAL表示不同；这是未引用缓冲/缺NORMAL差异的明确记录，不能隐藏或对旧全buffer测试直接放宽。活动全buffer门保持严格字节一致。

原F/M单嘴宽：9→2实际geometry；单鼻1、单眉1、单眼4。原始所有校验与法线计算仍会进行，不能把geometry数量减少换算成真实毫秒收益。

cpu-1同时有4生命周期（pending reset/dispose、新眉覆盖、prepare失败），所有已创建克隆只dispose一次，原geometry从未dispose，旁实例不变。lifecycle-cpu/report.json另有两实例均活动时隔离/一方dispose及新域HTTP503后保留旧geometry与重试，共2项通过。

source-endpoints/report.json另直接对照11个独立导出端点（原男女嘴±4/眉/鼻/眼各端点、男jaw嘴+4），活动primitive按完整buffer、跳过部分按实际引用比较所有表达。位置最大9.0804nm；带源NORMAL的鼻/眼/jaw五个端点全部shape法线分量最大8.598e-6，未放宽原3e-7m/1e-5门。旧嘴/眉raw导出没有NORMAL morph，因此不将其raw法线冒充独立参考；其全部NORMAL严格基线等价已由cpu-1覆盖。

## 必要预备缓存

原foundation只有一个faceWarmPromise：首嘴只预备少数parts后，会把后续新眼部parts当已完成。因此新helper按每actor、mesh UUID、现attributes/morph layout与relative、material UUID/version缓存。新geometry UUID不作为key（同布局新clone复用程序）；normal count变化属于新变体。每批创建自己的材料克隆；失败只移除/释放自己的新条目，不清已有成功或别批pending。只有新批成功、材料对象及version仍对应当前mesh时，才淘汰该mesh全部layout中旧的settled材质版本；保留当前版本多layout。旧pending逆序完成若不再对应当前材料则只释放自己；编译中不提前dispose。dispose立即释放已稳定条目，未settle批次在settle后清理；dispose早于compile微任务则不启动renderer。

warm-version-lifecycle/report.json（最终版本，7项）：精确产品helper+真实Three/Face对象，renderer为可控mock，非GPU。嘴+4→嘴−4→眼→眉→重叠→0→嘴，compile新增parts数量依次4/0/6/2/2/0/0（含outline）。material version/identity、relative、attribute变体另检查；并发失败/重试/稳定引用保护/销毁/两actor隔离/同步stage失败/微任务前dispose均通过。额外两案例覆盖：旧材质两layout→新version只预备一种，旧全部淘汰；同version多layout复用；20次重复needsUpdate后稳定克隆有界；material对象替换；新旧pending逆序settle；新批失败不删稳定分支、重试后淘汰旧版。最终所有克隆材料各dispose一次。实际触发依据是唇色facial-palette及眉染色tintHair的needsUpdate，不泛称skinTone都会升version。

## 后续边界

先由根从冻结提交独立检出构建，再与同机器相邻基线做无录制定向成本，并检查嘴/眼/眉切换真实材质/表达。保留首次getProgramInfoLog/shadow剩余成本，不承诺解决换体全部停顿。本轮没有浏览器、GPU、构建或发布。

复跑脚本均要求全新输出目录：scripts/qa-facial-primitive-scope.mjs、scripts/qa-facial-primitive-warmup.mjs、scripts/qa-facial-primitive-lifecycle.mjs、scripts/qa-facial-primitive-source.mjs，使用 --out NEW_DIR。基线来自本包冻结快照，不读取未来HEAD冒充旧版本。

## 冻结

所有本候选产品文件和CPU脚本已写完后冻结。根将提交并独立检出构建；本代理本轮没有构建、GPU或发布操作。工作台过往冻结后修改的教训适用于本轮，冻结之后不再添加产品微调。
