# 换人 compileAsync 等待：定向浏览器回归

候选 `bcade40d24f1`（源码 `c222404`），基线 `a0dd7fb7bf4a`。候选 fixed dist 为 `experiments/body-switch-compile-fixed-v1/prototype/dist`。本包不修改产品、不更新公开入口。

## 实际结果

`transactions-r3/report.json` 四项通过，0 pageerror / console error：

- 明确注入 compile reject 后原 actor、motion、位置、时钟、相机和文档保持；候选未挂载。恢复真实 compile 后重试成功。
- 真实 compile 被 gate 暂停时，旧人物沿当前实际朝向行走，等待实际根位移超过 5mm（6秒上限）；随后改变暂停、速度、播放速率、镜头、服装、基础模式、动态与修正。释放 gate 后提交精确保留当时位置/朝向/时钟/暂停/速度/速率和检查设置。女裙对男体无适配时明确提示并回退裤装，未冒充裙装成功。
- 待切男时再请求当前女，旧女实例保持，晚完成候选返回 cancelled，loading 清理，不发生迟到提交。
- 所有注入均在 finally 还原 renderer 方法并释放 gate；真实正常录像没有注入或性能 wrapper。

原 `transactions` / `transactions-r2` 失败完整保留：分别是 QA 使用不支持的 0.5 播放速率、以及固定等待600ms便假定横向寻路已平移。不是已确认产品缺陷。r3使用真实接口允许的0.25，沿当前朝向并等待实际运动条件，不放宽最终状态门。

## 正常录像与工程抽审

`index.html` 可直接观看两段原生1600×1000正常1×视频。相同半身正面镜头、棕发暖肤，真实按钮女性→男性→女性，再点击动作/检查/外观三页。两版均同一 document、实际身体精确身份、颜色与镜头保持，0 pageerror。两版均有 Three TextureSource 重命名 warning，未作产品报错。

已实际逐张查看两片全部6张2fps时序图（每片33个抽样帧，包含加载至三页切换末尾）。旧片约5.5秒出现男体、10.5秒回女体；候选约5.5秒男体、10.5秒女体。工程抽样未发现新缺面、残留双人物或分区坍塌。换体后的讲话重新进入可见，两版都可见这个状态变化；本测试未声明讲话姿态跨身体连续、自然度或逐帧视觉通过。2fps抽样不能排除换体瞬间短异常；完整原片保留供观看。初始加载时间不同，因此两个视频不能将相同video时间当作同一骨姿。

轻量trace从就绪后记录，录像本身还包括更早的加载过程：

| 版本 | trace墙钟秒 | 模拟秒 | sim/wall | rAF P95/P99 ms | 最大ms | >50ms帧 |
|---|---:|---:|---:|---:|---:|---:|
| a0dd | 13.7048 | 12.7129 | 0.92762 | 6.2 / 6.2 | 843.3 | 2 |
| bcade | 13.2255 | 12.7585 | 0.96469 | 6.2 / 6.4 | 315.5 | 4 |

播放器/运行未减速；模拟时间因产品实际长帧处理没有完全追平墙钟。候选降低本次最大停顿，但仍有315.5ms长帧且>50ms帧数增加，不能说完全流畅。这是开发机带录像的短样本，不是普通电脑性能验收，亦不替代根代理独立无录制A-B-A测量。

## 资源与范围

本包正常同造型两版男体均84 geometries/43 textures，回女均84/42；没有采program完整生命周期。根代理另一独立成本场景记录男体84/41不变、program21→23，属于预编译未显示材质的有限额外变体成本，不自动称泄漏，也不据本包声称取消后program回稳。不同造型/采样阶段的texture值不可直接混比。

取消是在compile settle后丢弃候选，不是中断GPU编译。真实shader编译错误诊断、任意换材质新变体、上下文丢失、长期资源泄漏未在本轮扩测。没有重跑19组面部、全动作或裙装矩阵。

## 复跑

使用 `scripts/qa-body-switch-compile-browser.cjs`，每次必须指定未存在的输出目录。各执行目录保存实际脚本快照、固定构建身份及原报告。示例：

```powershell
node scripts/run-fixed-check.cjs experiments/body-switch-compile-fixed-v1/prototype/dist scripts/qa-body-switch-compile-browser.cjs --build=bcade40d24f1 --mode=fault --out=evidence/new-unique-fault-directory
node scripts/run-fixed-check.cjs experiments/body-switch-compile-fixed-v1/prototype/dist scripts/qa-body-switch-compile-browser.cjs --build=bcade40d24f1 --mode=normal --out=evidence/new-unique-video-directory
```

浏览器及两个临时服务均已关闭。产品未提交/未发布。`manifest.json` 保存本包文件实际SHA，`package-review.py` 可重建观看页与摘要；原始失败报告不回写。
