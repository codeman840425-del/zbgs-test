# B 男jaw短发源闭环

从固定026ab20独立分支制作；只新增指定source/scripts/public/evidence四目录。源检查完成，产品加载与视觉未在本分支执行。

- 同款styleId `male-sidepart-v1`；独立fit `male-sidepart-jaw-fit-v1`/1；精确目标25ac8、原源62b44、生产GLB fb5fd。原男包、人物控制器、作者extras未改。
- `fit.json` SHA `004f7b3bdb0b72d85849b13a05c9b4448a060a7a0d2660ebdeb25bd9f5311ad4`；`manifest.json` SHA `1db5dd6a73d662f0b1e90eb508d1226c626405045cbf02caa7e3a21d373036e9`。public与源包逐字一致，兼容仅jaw目标。
- `geometry-report.json`：挂点/骨架/原发与头部保护区一致，54表达；4个变动区严格相交候选原/新均false，历史75 Face接触不抹去。
- `original-generator-rebuild.json`：原固定数学/参数真实重跑，仅OUT重定向到新包，得到同fb5fd；`source-check.json`：六文件重复打包字节一致。
- 两次独立Blender导出3f2b7相同；250点408三角有向角点/UV等价，位置/UV最大差0。仍不是canonical同字节。`export-normal-diagnostic.json` 保留NORMAL最大分量差5.9439e-4，生产不替换原GLB。原链sampler警告在README明示。
- `initial-check-index-bijection.json`保留初次checker失败：7/106同位置/UV而法线不同，不能假设一对一最近位置索引；随后核完整有向三角角点并记录法线差，不降低位置门、不改资产。

单次源原几何复做约0.17秒，完整CPU检查约0.47秒；Blender各约0.35/0.23秒（内部时长，不含启动），未渲染/未GPU。详细命令、授权来源、原上下文可编辑源、原输入SHA、重复数据保留策略见 `assets-source/m2-male-jaw-hair-fit-v1/README.md` 与本目录 `manifest.json`。这不是性能验收。

下一步是root/prototype固定集成runtime fit版本门后做工单B实际检查，不能仅复制bodySHA放行；本源通过不等于游戏通过。
