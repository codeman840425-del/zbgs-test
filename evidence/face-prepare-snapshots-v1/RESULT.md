# Face prepare 单事务源快照复用候选

产品已冻结，仅修改 `prototype/src/facial-geometry.js` 的 `prepare()`；SHA `5ded60c6795bc52d7464bb87f793199c2efd80770fd2e029bfc19708084dfa5f`。基线为撤回 first-use 实验后的 `603e483`（公开1fff源码）。本包baseline与该提交逐字节相同；normal函数、apply、其余域准备和所有外部模块未改。首用候选01a不属于本改动，未再加入GPU预备。

## 实际变化及合同

prepare异步事务内新建两个WeakMap：真实BufferAttribute对象→packed独立快照；快照→digest Promise/finite结果。位置、索引、UV及现有要求验证的法线/形态复用这些结果。相同快照引用的跨primitive morph一致性比较直接成立，独立对象仍逐值完整比较。

每个geometry/primitive仍核自身格式、材质身份、对应position/index/uv期望SHA；jaw仍额外逐primitive核base normal与全部morph源SHA。原女/男mouth原有morph门是finite和跨primitive一致性，未新增或声称已有全morph源SHA；nose/eye后续域独立身份核查完全不动。缓存中没有“这个expected SHA已通过”的结果。

索引三角顺序、normal公式、原全脸表达计算、阈值、几何输出、GPU和动作未修改。快照不会被apply写入，apply仍从first.position和全部morph的slice独立求值。Map仅属于这次prepare事务；失败重试重新建立，不能跨actor/全局复用。

源约定：当前VRM表达仅改influences，Face源BufferAttribute在准备期间只读，包括对象/array/count/itemSize/version。此优化不承诺支持外部在异步准备期间偷偷改array或布局；没有为了这种未声明行为建立全局版本平台。typed-array快照为私有只读使用，并非JavaScript Object.freeze数组。

## CPU 实际证据

`cpu-1/report.json`：原F/M及male-jaw，分别共享GLTF accessor属性与每primitive独立属性两套fixture；F/M各29组合×2，jaw2组合×2，共120。与真正旧模块对照：所有primitive的全部attributes、index、每个POSITION/NORMAL morph缓冲SHA严格相同（含未引用点和非活动primitive），所有shape及一份全缓冲混合表达数值严格相同。bounds、原geometry引用/clone选择、prepareRender parts、状态、influences引用及源数组不变。这里没有“只看受影响点”的表示例外。

14个坏输入与基线拒绝原因一致：独立position/uv/index/morph、NaN、jaw独立normal、共享属性但不同primitive expected SHA、interleaved同buffer不同offset。失败修复再重试重新核验原已通过区域。五个生命周期覆盖失败重试、pending重置/销毁/新请求覆盖/prepareRender失败、原geometry保留及clone仅释放一次。两actor同时使用同源对象，取消/销毁一方不动另一方。

`prepare-cancel/report.json`再补两项：真实prepare源position digest Promise挂起期间reset/dispose；完成后均cancel、不提交，reset后可再次正常编辑及复位。

getter计数用于确认缓存范围，不是实测性能或heap：女性每actor源读取共享fixture364989次、不共享3209109次；同源对象第二actor仍完整进行相同次数读取，证明无跨角色缓存。真实内存/GC/总耗时收益尚未测量，不能凭计数宣称改善。

## 复跑与保留

```
node scripts/qa-face-prepare-snapshots.mjs --out evidence/face-prepare-snapshots-v1/new-cpu-run
node scripts/qa-face-prepare-snapshots-cancel.mjs --out evidence/face-prepare-snapshots-v1/new-cancel-run
```

两个入口拒绝覆盖已有输出。执行脚本、candidate snapshot和报告保留于对应目录；基线/profile与最终源快照在包根。final-source-pins.json包含精确源/脚本身份。语法与CRLF-aware diff检查通过。未构建、未浏览器或GPU测量。后续由根在同输入实际候选中测准备时间、旧场景帧、总请求、首draw与JS backingStorage；成本基线与新候选不可换标。
