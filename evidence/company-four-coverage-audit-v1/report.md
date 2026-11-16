# 公司平台四款外观覆盖审查

审查日期为 2026-11-16，范围是用户要求的每个明确外观分类及细分分支至少四件可区分、可替换的结构外观。审查只读完成，未修改共享代码、CAP、主目录，也未运行 GPU。详细记录见 [scope.json](scope.json)。

## 判定口径

`COMPANY-APPEARANCE-PRODUCTION-STANDARD.md` 将功能规格、资源身份和视觉模型分开管理。只有保留同一功能合同、具有独立资源身份并且几何或构造确实不同的模型才计数。重复实例、同一模型换版本号、只改颜色、只改状态参数、或改变足迹后无法替换原规格的模型不计入四款。

建筑显示模块按四款资源审查。地板、墙板、门框、窗板和地毯属于可替换显示资源。通路、区域连接、边界关系和镜头属于布局数据或观看机制，不能把它们虚构成四套资源。空间材质中的颜色字段也不能单独凑成四款几何外观。补光系统按完整灯具加支架的组合资源计数，灯具和支架的子网格不要求各自另有四个独立设施。

## 当前覆盖

| 分类 | 细分分支 | 可计数外观 | 目标 | 缺口 | 当前结论 |
| --- | --- | ---: | ---: | ---: | --- |
| 建筑模块 | 地板 | 0 | 4 | 4 | `floor` 与 `floor-stripes` 是一套程序灰盒和覆盖条，不是四个可替换地板 |
| 建筑模块 | 墙板 | 0 | 4 | 4 | `back-wall` 与 `left-wall` 是房间位置专用的程序板，不是四个独立墙板款式 |
| 建筑模块 | 门框 | 0 | 4 | 4 | 出租屋连接记录有门口关系，没有门框资源 |
| 建筑模块 | 窗板 | 0 | 4 | 4 | 窗框、窗格和分格嵌在 `back-wall`，没有独立窗板资源 |
| 建筑模块 | 地毯 / 地面装饰 | 1 | 4 | 3 | `resources.json` 的 `rug` 是一件静态地面装饰，应纳入覆盖审查 |
| 静态装饰 | 绿植 | 4 | 4 | 0 | `plant-palm`、`plant-bonsai`、`plant-cactus`、`plant-broadleaf` 已有独立源导出和回读记录，`plant@1` 仍是功能参考 |
| 静态装饰 | 挂画 / 墙饰 | 4 | 4 | 0 | `wall-art-triptych`、`wall-art-sunburst`、`wall-art-relief`、`wall-art-woven` 已有四个结构不同的资源，均沿 `wall-art-standard@1` 挂墙合同 |
| 简单动态物件 | 补光灯 | 1 | 4 | 3 | 只有 `fill-light@1`，开关和强度状态不增加外观数 |
| 简单动态物件 | 屏幕 | 1 | 4 | 3 | 当前以 `monitor@1` 作为屏幕实现 |
| 单人交互设施 | 椅子 | 1 | 4 | 3 | 只有 `chair@1`，重复工位实例不计数 |
| 单人交互设施 | 单人直播工位 | 1 | 4 | 3 | 只有一套 `stream-station` 组件模板 |
| 多使用点设施 | 双人沙发 | 2 | 4 | 2 | `lounge-sofa@1` 和兼容的 `timber-sofa@1` 可计数 |
| 组合设施 | 整套直播工位 | 1 | 4 | 3 | 模板可复制但当前只有一套组件外观 |
| 组合部件 | 桌子 | 4 | 4 | 0 | `desk-trestle`、`desk-pedestal`、`desk-cabinet`、`desk-frame` 已有独立源导出和回读记录，`desk@1` 仍是功能参考 |
| 组合部件 | 显示器 | 1 | 4 | 3 | `monitor@1` |
| 组合部件 | 键盘 | 4 | 4 | 0 | `keyboard-compact`、`keyboard-split`、`keyboard-retro`、`keyboard-console` 已有独立源导出和回读记录，`keyboard@1` 仍是功能参考 |
| 组合部件 | 桌面麦克风 | 4 | 4 | 0 | `desk-microphone-ball`、`desk-microphone-ribbon`、`desk-microphone-broadcast`、`desk-microphone-capsule` 已有独立源导出和回读记录，`desk-microphone@1` 仍是功能参考 |
| 组合部件 | 椅子 | 1 | 4 | 3 | 复用 `chair@1` 固定座椅规格 |
| 组合部件 | 补光系统 | 1 | 4 | 3 | `fill-light@1` 是一套完整灯具和支架资源 |

当前 19 个需要外观配额的分支中，绿植、挂画、桌子、键盘和桌面麦克风五个分支达到四款，14 个分支仍低于四款。双人沙发是第二高覆盖，只有两款可替换外观。

## 明确范围但不计四款外观的分支

副总工简报和连续目标还明确了通路、区域连接、边界、空间材质、建筑灯光和观看镜头。它们分别属于连接与导航、空间关系、运行渲染或观看机制。当前出租屋示例的 `door-stream`、`door-work`、`door-rest` 和 `living-connection` 证明了连接数据存在，不能当成门或走廊模型。镜头切换同样不应为了凑数量制作四套逻辑。`scope.json` 将这些分支保留为范围事实并标记 `appearanceQuota: null`。

补光系统的灯具与支架是组合内部的必要部件。当前资源将 `light-base`、`light-pole`、`light-housing` 和 `light-diffuser` 放在一个 `fill-light` 资源中。四款补光外观应各自包含完整灯具和支架，并保持灯光状态、方向、强度和色温契约。审查不要求把子网格拆成四个独立目录。

## 沙发和灰盒排除项

`lounge-sofa@1` 和 `timber-sofa@1` 使用相同的双人多使用点功能合同，分别具有不同的木框、支柱、坐垫或背板结构，因此计为两款。`lounge-sofa@2` 的阻挡足迹 X 半尺寸不同，标准明确拒绝把它作为 `lounge-sofa@1` 的换外观结果。它保留为独立版本记录，不计入四款兼容替换数。

`resources.json` 中的 `couch` 没有双人使用点和占用合同，不能冒充多使用点沙发。房间中的 `desk`、`plant`、`chair` 和 `rug` 是程序灰盒资源，存在不等于已完成四款生产覆盖。

## 后续候选

空间记录还明确了直播区、工作区、休息区、公共客厅以及民房 A、单间屋 2A、整套出租屋、整层 16 个单间和可配置层数的大楼关系。这些是空间用途和布局组合，不是自动产生四款外观的资源。老板工作台、老板房和顶层私人楼层属于后续候选，当前没有交付资产，也不应被写成已完成能力。

本审查确认建筑五类显示资源的下一批目标可以按 `floor-panel`、`wall-panel`、`door-frame`、`window-panel` 和 `rug` 各四款单独生产。门框资源只表达显示框体和净开口包络，不能宣称门叶开合。窗板不能宣称真实窗洞或开关。新资源仍须沿固定单位、挂载、源文件、GLB 回读和几何包络检查交付。

## 证据来源

范围原文来自 `docs/COMPANY-PLATFORM-DEPUTY-BRIEF.txt` 的 3.1、3.2、3.3、5.1 和 6 节，`docs/COMPANY-APPEARANCE-PRODUCTION-STANDARD.md` 的有限规格、当前尺寸和生产实检部分，`docs/COMPANY-SPACE-DESIGN-NOTES-2026-11-16.md` 的空间组成、公共区域和后续候选部分，以及 `docs/research/COMPANY-PLATFORM-CONTINUOUS-GOAL-v2-2026-11-16.md` 的 C1、组件与组合、四类设施和 C2 部分。实际目录来自 `prototype/src/company/library-catalog.json`、`facility-catalog.json`、`resources.json`、`templates.json`、`templates-extended.json` 及 `prototype/public/company-assets`。桌子、键盘、桌面麦克风、绿植和挂画的四款独立资源及 `source-export-readback-passed` 记录来自 `evidence/company-static-collection-v1/report.json`。
