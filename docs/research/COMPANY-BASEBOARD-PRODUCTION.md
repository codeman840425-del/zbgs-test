# 按房间边界制作踢脚线

踢脚线由房间或公共区的 `finishes.baseboard` 选择。同一款可用于长短不同的墙面和多个房间。旧装修省略此槽时保持原状。装修面板中的“踢脚线”可按房间换款或移除。

## 生产输入

截面坐标使用米制 `[入房深度, 离地高度]`，最后一点连接首点。靠墙和接地各有一条边，线条高度 0.12 m，最大深度 0.02 m。造型可以有凹槽、圆唇或斜面。四款共用同一安装边界。材质用可重复的纹理，资源和模板沿已有版本机制保存。外观生成器和具体可编辑参数见 `assets-source/company-baseboard-v1`。

引擎按实际墙脚生成几何。与地面相接的墙段在房间坐标中排序，抬高窗台下的相邻段合并。门净洞留空，有门框的房内侧退至框体宽度外沿。相邻墙的两个端面斜接。若墙角和门框间只剩最多 20 mm 的墙脚，省去这小段并让相邻边退至门框投影外缘，用方口封边。每段随所属墙的可见性切换，碰撞、导航、设施坐点和任务沿原有房间数据计算。

取源时采用工程现有的 Three.js。其三角剖分用于给二维截面的端面生成真实三角形，长边用沿墙米制坐标生成纹理映射。参考的许可和几何文档见 [Three.js r187 许可](https://github.com/mrdoob/three.js/blob/r187/LICENSE) 与 [Three.js ShapeUtils](https://threejs.org/docs/pages/ShapeUtils.html)。

## 制作与复验

在接收方源码工作副本执行 `node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/baseboard-rooms.json ../my-baseboard-rooms`。两个输入分别包括带真实外门及抬高窗台的民房、旋转了 90° 且两侧各有独立饰面的出租屋。修改其中一间的 `set-surface-finish` 操作即可换款。以下实例替换一个房间的踢脚线，清除时将 `finish` 写为 `null`。

```json
{"type":"set-surface-finish","id":"baseboard-studio/ground/live","surface":"baseboard","finish":{"resource":{"id":"baseboard-square","version":1}}}
```

几何检查需观察真实门洞两端、窗下连续段和房间墙角。出租屋还需核对共享墙两面的朝向、按房间换款及保存恢复。此设施为静态收边，采用真实房内尺寸；人类近景可放大查看，房间远景可与地面和墙面同时观察。
