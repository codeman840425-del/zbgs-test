# 轻量制服眼镜的角色静态预算

固定游戏 `fdbe4548 / 60c87f62e8b0` 的两份内部技术签名及其实际依赖均已复算。两人各自全部单件和单体指标通过 `m2-technical-v1`，同屏组也在暂定参考线内。与无镜 1K 双人相比，两副眼镜共增加 72,553 字节依赖和 4,416 个放置三角形，静态纹理对象与 RGBA8 估算均无增量。[输入签名](../signed-pair.json) · [逐文件、全部指标与三个分组](glasses-1k.json)

| 记录与组合 | 依赖闭包，字节 | 纹理对象 | RGBA8 含 mip，字节 | 放置三角形 |
|---|---:|---:|---:|---:|
| **戴镜 1K 女制服** | 27,231,630 | 27 | 103,809,708 | 21,376 |
| **戴镜 1K 男制服** | 27,838,188 | 25 | 105,557,676 | 17,384 |
| **戴镜 1K 同屏** | **41,127,656** | **52** | **209,367,384** | **38,760** |
| 无镜 1K 女制服 | 27,166,705 | 27 | 103,809,708 | 19,168 |
| 无镜 1K 男制服 | 27,773,252 | 25 | 105,557,676 | 15,176 |
| 无镜 1K 同屏 | 41,055,103 | 52 | 209,367,384 | 34,344 |
| 旧全分辨率女主持，镜架及手持麦 | 42,778,695 | 27 | 158,335,660 | 26,020 |
| 旧全分辨率男嘉宾，镜架 | 44,754,425 | 28 | 168,821,416 | 21,644 |
| 旧全分辨率同屏 | 73,590,958 | 55 | 327,157,076 | 47,664 |

同屏临时参考上限为依赖闭包 67,108,864 字节、96 个纹理对象及 RGBA8 含 mip 268,435,456 字节。传输按同路径、同字节的签名依赖取并集，每份角色分别计算纹理对象和放置三角形再求和。相同像素、同一文件及跨人共用 WebGL 纹理对象各有不同的判据。这里没有抵扣其他人物组合的 WebGL 实测共享量，也没有测量 GPU 显存、实际 HTTP 流量或普通电脑帧耗时。

无镜 1K 男女均使用原发、原色、`pants-top-far`，女装索引 5、男装索引 1。复算在固定 `553906db` 执行。去除新增的三个显式同屏组后，全部报告字段与归档逐项一致，退出码为 0。[无镜签名](../../m2-uniform-lite-operator-v1/records.json) · [完整复算](plain-1k.json) · [历史单体报告](../../m2-uniform-lite-operator-v1/static-budget.json)

将同一无镜签名交给本次 `fdbe4548` 再算，报告仅变更源码提交字段。新旧签名的身体、原发、五官、服装和材质选择一致，女性新签名的调色身份从 `appearance-color-v3` 更新至 `female-uniform-head-v1`，原色选择及已有资源文件哈希一致。新增的四个同屏依赖为镜架 GLB 54,484 字节、共用道具清单 2,824 字节、女镜腿 7,617 字节、男镜腿 7,628 字节。女单体增 64,925 字节，男单体增 64,936 字节。镜架含 7 个 primitive、2 种材质、2,208 个放置三角形及 0 张贴图，每人装载一副。

戴镜组同屏共有 23 个依赖文件；距三项参考限额尚余 25,981,208 字节、44 个静态纹理对象及 59,068,072 字节 RGBA8。预算 CLI 返回 0，报告的 `runtimeAdmission` 为 `false`。

全分辨率旧双人使用不同身体、服装和道具组合。两个身体与上衣都超过各自的 RGBA8 限额，主持人的麦克风 9 个 primitive 超出 8 个的单件上限。同屏传输超 6,482,094 字节，RGBA8 超 58,721,620 字节。按 `1239c0e2` 的原签名复算得到退出码 1，全报告字段与归档相同。[旧签名](../../m2-uniform-live-batch-v1/signed-pair.json) · [旧预算报告](../../m2-uniform-live-batch-v1/budget.json)

从主工程复算本次预算：

```powershell
python -X utf8 -B scripts/production/record_budget.py measure evidence/m2-uniform-lite-glasses-game-v1/signed-pair.json --source-root experiments/worktrees/record-glasses-22d4ec39 --budget-version m2-technical-v1 --concurrent-group uniform-glasses-female-v1 --concurrent-group uniform-glasses-male-v1 --concurrent-group uniform-glasses-female-v1 uniform-glasses-male-v1
```
