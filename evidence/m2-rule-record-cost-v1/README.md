# 两条参数角色原签的开发机资源采样

固定普通包使用游戏 `60e3934ddd8a` 和两条原签 `public-batch-a`、`public-batch-b`。采样器先校验普通包及记录清单的摘要，然后在三个独立浏览器上下文分别打开同一普通入口。每次先核对游戏实际载入的两条签名、外置身体和三件已选制服。移除首开角色后，用该页面已核验的原签分别选择 A、B、A+B，各采 12 秒。三个实际首开均为双人。单人数字是身体数据已经登记后的单人场景统计。

## 实测结果

CfT `145.0.7632.6`、Playwright `1.58.2`、受审可执行文件 SHA-256 `ff0c99fc5bb2301cad77930aa76e5354cf2a5fefb7efdcf3b3bc10ba0550c015`。开发机 WebGL2 使用 NVIDIA RTX 4090 的 ANGLE/D3D11，视口 `1440×1000`。三次首开分别在约 2.306、1.327、1.320 秒观察到双人就绪，均读回两条原签及三件可见制服。[原始采样及逐帧数据](cft145/report.json)

| 测量 | 单人 A | 单人 B | 双人 A+B |
| --- | ---: | ---: | ---: |
| 重新选择至绘制采样（毫秒） | 530.8 | 526.7 | 1,008.6 |
| Three 纹理 / 几何对象 | 39 / 20 | 39 / 20 | 77 / 39 |
| 每帧绘制调用 / 三角形 | 26 / 23,878 | 26 / 23,878 | 51 / 47,754 |
| 可见材质图像 / 活 WebGL 纹理句柄 | 22 / 22 | 22 / 22 | 44 / 44 |
| 帧间隔 p95（毫秒） | 6.2 | 6.2 | 6.2 |
| 更新 CPU p95 / 提交渲染 CPU p95（毫秒） | 0.6 / 0.4 | 0.6 / 0.5 | 1.0 / 0.6 |

读到的可见材质图像均为 `ImageBitmap`，尺寸介于 `8×8` 和 `2048×2048`。双人包内共用一份制服文件，可见材质实际持有的活 WebGL 句柄仍为 44 个，单人各 22 个。每次离场后，采样到的角色纹理句柄均已失效，Three 回到 `1` 个纹理、`1` 个几何和 `1` 次绘制调用的场景基线。三角形为渲染器实际提交计数，含地板和按材质产生的额外绘制。[静态资产计数](../m2-rule-batch-delivery-v1/budget/record-measure.json)

## 重放

从 `F:/gamemake` 执行。若结果目录已存在，改用同一证据目录下的新子目录。

```powershell
$p = 'output/m2-rule-batch-delivery-v1/pair'
$sha = '99cb065d59476f5f800979cb903395ddc419f28e483f9cb62262e8b212b52a06'
node scripts/run-fixed-check.cjs "$p/game" scripts/qa-record-budget-runtime.cjs "$p/records.json" evidence/m2-rule-record-cost-v1/cft145 60e3934ddd8a --ordinary-package $sha --browser-config scripts/production/fusion-cft145.json
```

结果仅覆盖开发机的三个 12 秒窗口。未测逐图解码耗时、实际 GPU 字节或普通电脑。HTTP `Content-Length` 仅为服务器声明，原严格网络状态保持失败。
