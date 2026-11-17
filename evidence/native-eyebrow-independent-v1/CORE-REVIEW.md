# 公共native-palette-part独审

在root封定5dc94c4公共核心及a759074/d5bea1e眼/眉薄包装下，独立5组CPU检查通过，未发现本范围新增阻断。实际原7586 VRM/MToon与固定PNG，图像解码/Canvas使用Pillow像素fixture，非WebGL。

真实iris和brow分别prepare保持原map/shade，先提交iris、再注入brow material.update一次异常，brow自身恢复，测试协调器显式调用iris prepared.rollback后两个部件及选中色全部恢复；重试成功。此检查不替上层caller调用rollback的证明。

多变体用fixture添加greenTwin键，仍指向同一已核green PNG，以区分资源cache与纹理对象，不制造新生产颜色。两键各自私有texture/bitmap，切回复用已有cache且无新fetch，rollback回到原选中色，销毁关闭各bitmap。实际原map/shade在CPU loader中是两个独立texture对象，因此两色应有4texture；首次core-v1误预计2导致测试失败，原失败保留，core-v2只改按unique借用源计数。

非法选择未使合法prepared失效；同材质另owner请求拒绝、不损害原owner；销毁恢复借用map/shade且不dispose源texture；异步bitmap返回前销毁，迟到bitmap关闭，fresh helper可重获owner。篡改原像素拒绝发布，恢复实际原像素后可重试。两部件的角色/材质采样/alpha来自实际原生数据。

代码：core-check.mjs；结果：core-v2/result.json；旧失败：core-v1/failure.json及core-check-first.mjs.txt。上层真实组合事务、v9/旧iris配方迁移仍另测，不由此报告推定通过。
