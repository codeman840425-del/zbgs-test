# 男女制服鞋同款对照

[打开本地视频对照页](index.html)。选择女制服或男制服，可并排播放原平底和 20 毫米平行厚底的房间全景，再看足部近景中的坐姿换鞋。每段录像保留原速，观感待确认。

| 身体 | 原平底全景 | 厚底全景 | 足部近景 | 房间回执 |
|---|---|---|---|---|
| 女制服，套装 5 → 6 | [26.3 秒](female-room-02/room-flat-1x.webm) | [26.3 秒](female-room-02/room-platform-1x.webm) | [11.3 秒](female-room-02/feet-swap-1x.webm) | [女体回执](female-room-02/report.json) |
| 男制服，套装 1 → 2 | [26.3 秒](male-room-02/room-flat-1x.webm) | [26.3 秒](male-room-02/room-platform-1x.webm) | [11.4 秒](male-room-02/feet-swap-1x.webm) | [男体回执](male-room-02/report.json) |

每具身体的两段全景使用相同的固定房间镜头，分别执行走停、坐起和短舞。近景记录厚底入座、坐稳换回平底、起身。房间脚本从既有平底记录恢复角色，近景中的换鞋状态也有单独的复测记录。两份房间回执均为 `technical-pass-visual-pending`。[平底原签](../m2-uniform-lite-operator-v1/records.json)

## 配方、签出与游戏包

批次请求把 `uniform-top-v1 / basecolor-1k-v1` 和 `uniform-platform-shoes-v1 / parallel-20mm-v1` 同时分配给两人。每具身体使用自己的上衣、裤装、鞋楦和绑定。审查模式得到两个候选，制作入口实际签出两条 revision 1 记录。正式模式仍要求整套造型的准入证据。[共同配方](../../assets-source/sole-variant-female-v1/uniform-pair-request.json) · [女鞋制作](../../assets-source/sole-variant-female-v1/README.md) · [男鞋制作](../../assets-source/sole-variant-v1/README.md) · [审查模式](fixed-technical/plan.json) · [正式模式](formal/plan.json) · [签出的记录](signed.json)

固定源码为 `da2edab6108433326c900c5f649103d8fd3ab5ee`，运行构建为 `8877eb96279480e9f7c6001598338cb6f2f85e7dafa030b88967f4c4cac7846b`。两个独立检出的 541 个构建文件逐件一致。独立双人包共 38 个文件、43,939,306 字节，包清单 SHA-256 为 `641d0327ab4613218c31f63da2a6ea8cc5e7d13be36ebec3f3e9ceba6d11e248`。两次新浏览器会话分别读回女套装 6 和男套装 2。[构建对照](rebuild/build-comparison.json) · [独立包清单](../../output/m2-cross-body-shoes-v1/game-package/runtime-package.json) · [冷开回执](cold-game/run-NMAsdI/report.json)

厚底双人依赖并集为 23 个文件，较原平底增加 18,272 字节和 144 个三角形。两种穿搭的静态估算均为 52 个纹理对象、209,367,384 字节 RGBA8 含 mip。普通电脑帧时间和物理显存仍待测量。[双人预算及逐件来源](budget/README.md)

## 技术失败记录

- 首次审查模式从稀疏检出调用生产查询时缺少 `scripts/headless-avatar-node.mjs`，两个条目均在查询阶段退出。补齐固定提交所需输入后，原批次在审查模式得到两个候选。[首次计划](technical/plan.json) · [重跑计划](fixed-technical/plan.json)
- 首次男女房间脚本都在录片前读取了被同名局部变量遮蔽的 `flat`，报 `ReferenceError`。表格引用修正脚本后的第二次录制。[女体首次回执](female-room-01/report.json) · [男体首次回执](male-room-01/report.json)
- 独立包导出分别拒绝了缺失的女鞋和长度相同但内容变更的女鞋。恢复原文件后，同一输入生成上述包清单。[导出拒绝与重试](rebuild/export-retry.json)

## 重放冷开与预算

在角色项目根目录执行。冷开命令会为已有独立包启动临时本地服务，两次分别打开和关闭浏览器，并在工程内的新子目录留下回执。

```powershell
$package = 'output/m2-cross-body-shoes-v1/game-package'
$pin = '641d0327ab4613218c31f63da2a6ea8cc5e7d13be36ebec3f3e9ceba6d11e248'
node scripts/run-fixed-check.cjs $package scripts/qa-footwear-cold-package.cjs $pin output/m2-cross-body-shoes-v1/replay-cold
python -X utf8 -B evidence/m2-cross-body-shoes-v1/budget/replay.py
```

从新检出重放时，按[两个检出的逐步命令](rebuild/package-comparison.json)构建，并在制作端使用包含 `scripts` 和目录里各项 `recipeSource` 的固定检出。依赖齐全后按[共同配方](../../assets-source/sole-variant-female-v1/uniform-pair-request.json)运行 `variant_batch.py --diagnostic` 和上文的签发检查。
