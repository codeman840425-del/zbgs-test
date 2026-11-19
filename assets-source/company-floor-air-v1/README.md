# 落地空气设备 v1

生产分支 `fan-and-air-purifier` 的四款设备均以米建模，底面中心为原点，+Y 向上、+Z 朝前。安装包络为 0.40 × 0.80 × 0.40 米，阻挡范围为底面中心左右、前后各 0.20 米。真实触地面为 32 边配重底座。各款使用同一安装和状态合同。

| 配方机制 | 开口、支撑与可见结构 | 可编辑的几何输入 |
| --- | --- | --- |
| tower | 转盘支颈、长槽横向导风叶、上部操作区 | 机身宽度、导风叶数量 |
| pedestal | 单立柱伸缩杆、前后护罩、独立轴流叶轮 | 叶片数量、桨距、弦宽系数、护网辐条数 |
| circulator | 双侧支架、俯仰轴、上提手、深筒风道、独立叶轮 | 同轴流款，另有整筒仰角 |
| purifier | 前部进气格栅、滤芯暗腔、独立顶部出风百叶 | 机身宽度、进气格栅数量、出风百叶数量 |

`sources.json` 保存共同制作提示词、设备厂家参考、上游来源与复用方法。`original/` 为 Kenney Furniture Kit 2.0 原始 GLB 和随包 CC0 许可。立柱扇和斜筒循环扇只提取其中一片真实木色扇叶的 20 个三角面，再按半径、弦宽、桨距和数量适配到轴心。外壳、落地支承、指示器和护网由本项目配方生成。塔扇与净化器使用独立封闭风道。成品不带厂商商标或照片。

## 生产与复验

在公司平台副本根目录使用已安装的 `prototype` 锁定依赖，或在该副本运行 `npm ci --prefix prototype`。以下命令从该根目录执行。

```powershell
node scripts/company-platform/build-floor-air.mjs --check
node scripts/company-platform/build-floor-air.mjs --output output/floor-air/asset-reproduction
node scripts/company-platform/build-floor-air.mjs --parameters assets-source/company-floor-air-v1/examples/fifth-tower.json --output output/floor-air/asset-fifth
```

`--check` 对四款配方逐一导出两次，回读完整 GLB，比较注册记录及模型字节。CPU 检查覆盖真实最小/最大顶点、触地面积、正面及斜上方的指示器遮挡、叶片数量和透过护网的可见性。`--output` 在项目的 `output/` 或 `company-workspace/production-trials/` 下独立生成同结构目录和 `report.json`。第五款把塔扇机身从 0.205 米改为 0.285 米，横叶从 13 片改为 21 片，并换用蓝色外壳。`--write` 可补回默认配方缺失的登记和模型；遇到不同的已存在字节会报告冲突。修正输入后可沿相同独立目录重试；发布新造型应使用新身份或新版本。

运行时从每款 `resource.json` 读取 `display`、`stateSchema` 和 `visualRotor`。电源与三段速度指示均为独立实体透镜，默认外观保存灭灯材质；房间根据 `on` 和整数 `speed` 应用逐档点亮。两款轴流扇的 `air-rotor` 局部 +Z 轴穿过轮毂；斜筒款把倾斜放在父支点。灯面影响设备自身显示。该族的几何与视觉状态不提供风力、过滤率或房间空气质量模拟。
