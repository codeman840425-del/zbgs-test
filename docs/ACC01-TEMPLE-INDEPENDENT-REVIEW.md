# ACC01 镜腿配置独立代码审查

范围：只读 `experiments/acc01-fit-worktree` 的 helper/manifest、live 三处接入、生成脚本和79项Node回执，以及既有 de62几何/b345拒绝报告。未启动浏览器、未重跑拟合或修改运行时。本次没有发现当前冻结 F/M 输入下的阻断性代码错误；不等于造型或实际支撑通过。

## 身份与版本边界

当前 helper raw SHA `52a1790c6466fab50c0d258153e024b910fb69e362f18567efd267ea1e202ad6`，与79项Node回执一致。F/M public profile与source副本逐字节相同，bytes/SHA均匹配编译进bundle的manifest：female `cb56bd93…`，male `3f14e225…`。原眼镜GLB SHA实核为 `c8098a499434c384850a73e6c207fb6c5e85620e9012c4426cd989952e5bec52`。

运行链先验证完整眼镜GLB，再以精确avatar SHA查询profile；profile响应长度/hash、body/accessory SHA、两mesh唯一名称、36点position hash均核。模板不按字符串female/male冒充同体适配。两个原体之外默认throw；b345 `acc01-unsupported/report.json`实测jaw请求后 status=error/requested=false/loaded=false、无mount，原F/M加载成功。`?glassesFit=legacy` 是显式诊断绕回旧眼镜，不是未知体自动降级，也不证明派生体已适配。

de62四姿几何与正常片仍属于 `de62b993e5e3`；b345当前只新增拒绝路径验证，不能把旧四片改标签成新版本。当前F/M成功算法/profile未改；此事实与新版本完整影片验收是两回事。

## 坐标、拓扑与法线

实读眼镜GLB：Temple-1/Temple1节点无额外TRS/matrix，原model空间与mesh位置空间一致。生成器用捕获glassesMatrix逆矩阵将实际皮肤转换回附件坐标；profile单位明确在整副眼镜缩放之前。helper用 `Matrix3.set(rowMajor)` 和同式 `(p-sourceCenter)·R + targetCenter`，随后原live挂点统一施加frame/scale，不重复加head世界变换。

每个36点镜腿分4环×9顶点，索引集合不重不漏；正交/行列式+1验证防止非法旋转。改clone的position，保留原indices/UV/材质，重算法线和bounds。实测de62 geometry equivalence最大位置差约3.7e−9m，其他frame/hinge/bridge位置差0、indices同值。它证明当前坐标公式与实际输入吻合，不证明任意新眼镜节点层级均可复用。

4环变形只是有限作者配置，LP每段65个中心线采样加管半径约束不等同连续实体碰撞/耳支撑求解。最终应依实际三角与正常画面，不能凭构造约束称所有表面都分离。

## 实例、失败与取消

每次GLTF parse产生本次独立对象；只对两个镜腿geometry clone。先准备两份plan并完成全部验证，最后检查signal，才成对替换。第二mesh不匹配时先前clone被dispose，原geometry未替换。成功后只dispose本对象不再引用的原geometry；同对象仍引用的几何保留，没有随意销毁avatar或他实例资源。

profile fetch使用同slot AbortController。取消/销毁在等待期间发生：fetch/hash后最终abort检查或live版本检查阻止mount，外层catch回收未安装object；正常卸载也回收clone。逻辑不存在共享可变向量缓存，编译registry只是只读数据。79项测试验证HTTP/hash/abort拒绝、双镜腿原子失败和实际两实例位置隔离；它没有逐项统计GPU dispose调用或浏览器所有异步时序，不能把这部分缺测叫已证实泄漏或完整生命周期通过。

## 已确认的证据修正与观感限制

早期 `assets-source/acc01-temple-fit/offline-candidate/triangle-diagnosis.json` 的 centerlineSections仍使用旧线。例如female t=.2的X=-.0596，而新profile应为-.0597705239。已告QA；最终 `output/playwright/m1/de62b993e5e3/acc01-fit-v1/triangle-diagnosis.json` 显式记录profile目录并已重算到新值。早期该字段不能当新耳支撑依据；actual三角统计与该中心线字段需分开。

当前耳patch选择外轮廓crest（源选择x阈值及最高Y），没有识别耳与头连接的上沟。镜腿上斜明显，最大变形女37.8/男40.9mm，不能称微调；1.76/1.08mm是采样点到三角的距离，不是摩擦、承重或物理佩戴证明。当前profile `verified:false`保持诚实。若用户不接受上斜，应回到有明确耳沟位置的新源形态任务，而不是为当前数值0交叉直接升级观感。

原生成器读input-269时没有原捕获SHA硬断言；当前冻结profile本身有完整runtime pins，不因此否定已核身份。QA正在补生成输入pins与重建回执，最终归档应保留那份工具版本/回执，不能把早期未固定输入的脚本说成已具备严格fresh恢复校验。
