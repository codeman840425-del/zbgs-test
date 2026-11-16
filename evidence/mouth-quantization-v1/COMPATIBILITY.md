# 验证合同与旧保存兼容建议（未实施产品接入）

当前公开 a7efd、运行配方 v5、mouth-visible-v2 的 id/SHA 均不变。隔离新recipe `male-mouth-canonical-v1`目前只声明−12%/0，是源候选，不能冒充现行负端点旧final已过门。生成/验证不需要修改几何数学。

## 最小立即可用路径：交付参考与算子身份分开

当前 `scripts/qa-face-visible-endpoints.mjs` 的端点参考是脚本硬编码路径。增加独立版本化的**验证参考manifest**，以原男性baseSHA、实际运行recipeSHA、parameter为键，负端点指向新canonical模型68a105…及其完整量化来源，正端点仍指向原+12%通过的final和原导出流程。先验证每项输入/模型SHA、operator和对应parameter，再运行现有严格位置/法线比较；不改变旧recipe文件中原endpoints或旧失败报告。

本包`check-runtime.mjs --endpoint`已实际实现这一最小对照入口，但尚不是全产品目录清单。它载入的仍是公开旧recipe，原因是该算子本来已与新规范化glTF数值一致。需要同时留“旧raw作者导出门”和“新规范交付门”两个清楚标签，不能删旧失败只保新成功。这一路径不影响旧保存，不增加runtime缓存身份，也不需要新用户视觉的数学变更声明。

## 如要正式登记完整v3新recipe

可以另建真实v3源recipe保留已支持 `[-.12,0,+.12]`，负样件引用本包新canonical、正样件仍引用旧包已过的真实final；逐端点记录流程。不把正端点称为canonical、不改其SHA。不需要重新生成正端点。

这不只是换配置中的一个SHA：当前 `prototype/src/facial-geometry.js` 的visible mouth只有一个selected entry，`set`严格比较`expectedRecipeSha256`；`appearance-recipe.js`把保存的原SHA传入该门。另有新brow/nose recipe验证伴随mouthSHA。因此直接替换唯一entry会使旧v5保存或眉鼻组合拒绝。

有界接入须保留原v2完整条目，按明确的旧/新recipe身份选择，不按任意SHA别名。完整operator等价证书应逐值比较baseSHA、POSITION/NORMAL/morph/primitive身份、source mapping、centerX、weights、保护域/法线邻域及参数值；差别仅允许新版本标识/逐端点来源元数据。旧眉鼻配方继续验证其原来pin的伴随mouth源，不能把新SHA偷偷替换给它；新算子复用相同原底也须先满足以上完整等价门。

若采用显式迁移，读取原文件不改其字节；验证已登记的旧→新身份对和相等operator后才建立新事务，并向用户说明保存版本升级，新下载文件记录新SHA。坏SHA仍拒绝，不能把`expectedRecipeSha256`直接置空。旧记录保留原样回读或另提供原版本回滚。最小受影响复验为旧v5 ±12%两文件、v3 ±12%新文件、原位、男嘴+眉鼻眼组合、错误SHA不变及取消回滚；不需要重录裙舞或扩大五官范围。

本轮建议先采取第一条验证参考路径，待root确认正式源版本接入时再做第二条。当前首绘停顿/用户新外观接受均不因本项源数值解决而关闭。
