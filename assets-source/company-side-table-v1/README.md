# Kenney 边几衍生源

目标为 side-table-v1，四 designId 为 round、square、nested、low，功能以 docs/COMPANY-SIDE-TABLE-CONTRACT-v1.txt 为准。

original/ 保留 Kenney Furniture Kit 2.0 原ZIP、四个原GLB/DAE及原许可证。源为CC0，作者/分发者Kenney。parameters.json记许可、原文件SHA、原节点/三角区域、尺寸/基点适配、有限加工及提示词。Three.js r187工具为MIT。游戏资源是外部原源的实际衍生件。

scripts/company-platform/build-side-table.mjs读取原GLB，烘焙原matrixWorld一次，按真实引用索引清除面积<=1e-12m²的退化面，再调整尺寸与底部基点。原DAE仍保留可编辑网格。round保原柱/撑/底座、按原台板下沿截切封真实截面，替换为48段半径.26m圆台板，顶面拆成真实矩形patch与带孔余面。square保柜门和把手，nested保两个真实全桌，low保长四腿系杆结构。全部状态为静态。

运行 node scripts/company-platform/build-side-table.mjs生成公开GLB/resource/collection和CPU生产报告。附加 --check重新生成并逐字节比正式产物，不读写evidence。作为模块import时不写文件。实际GLTFLoader读回同时经过固定data、既有generic support和独立side-table几何门。

参数第二输入 nested.smallOffsetX=.23，最终=.24。生产保before输入/GLB/资源读回，核其他三GLB字节保持和同输入重复导出相同。原初始产物及任何失败留在production-v1/initial-candidate和failures，独立门/运行状态按对应报告读，不能由源文件存在推定已经游戏验收。

真实游戏加载、兼容换款、父子移动/复制、关闭进程恢复、固定构建、普通电脑性能及用户视觉验收各需其独立证据。固定柜门和套几不提供开合或抽拉状态。
