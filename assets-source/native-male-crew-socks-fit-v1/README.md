# 原生男性 7586 短筒袜适配试作

在仓库根目录运行 `python -B assets-source/native-male-crew-socks-fit-v1/build.py`。需要 NumPy、SciPy、Pillow。脚本成功退出表示重现了预期拒绝。此次没有输出袜子 GLB。

本次使用 `plain-crew-socks-v1` 的原制版参数、脚面裁剪和闭壳检查。坐标来自原生 VRM1 骨层级的实际世界变换，并与逆绑定矩阵交叉核对。原始可编辑 VRoid、未遮罩 VRM、鞋裤和制袜源脚本身份保存在 [preflight.json](generated/preflight.json)。原作者记录仅供内部技术研究使用，许可字段逐项保留。

初次裁剪遇到重合 UV 顶点的原生权重差，最大 0.0000263751。一次修复让重合点使用该组中原始编号最小顶点的原始权重，所有组的正权重关节完全一致。[seam-readback.json](generated/seam-readback.json) 列出所有受影响的顶点。

原生成形器随后拒绝额外的踝部开边。独立边计数在两踝各检出 8 条开边，接近成对的顶点相隔 0.150–0.214 微米。当前缺少验证过的原生踝部接缝配对、合并及闭壳结果。[result.json](generated/result.json) 保存顶点、误差及可用的旧男底搭配。

[CPU 材质分区图](generated/lower-material-id.png) 从左到右为正面裸腿、正面穿鞋裤、背面裸腿、背面穿鞋裤。浅肤色是身体，深灰色是鞋，蓝色表示下装。采样已使用实际下装和鞋的遮罩。正背两个静止视角中，鞋口至拟制袜口的 11.23 厘米均能看到裸腿。该图用于核对材料覆盖，不承担动态接触或游戏观感验收。
