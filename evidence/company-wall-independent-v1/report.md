# 墙体观看与事务隔离独立审查

本次复核只读执行，使用 Three.js CPU 场景构造共享墙体、挂墙物、座椅接触点和两房布局。未修改源码、运行时或共享主树，也未运行 GPU。可复现探针见 [probe.mjs](probe.mjs)，结果见 [report.json](report.json)。

## 结果

探针包含 8 项检查，6 项正向通过，2 项非法操作按预期拒绝，0 项失败。

| 检查 | 结果 |
| --- | --- |
| 正常高墙 | 墙体仍为完整 2.8m 高，导航障碍和物理边界保持存在 |
| 共享墙重复面 | 相邻房间的两张共享墙面按楼层、轴向、法向间距和重叠区间归入同一 wall group |
| 挂墙物绑定 | 共享墙上的挂墙物继承同一 wall group，隐藏组时两侧墙面和挂墙物使用一致的展示组 |
| Full 观看 | `setWallView({mode:'full'})` 不改变文档、导航障碍或 use point 描述 |
| Cutaway 观看 | 摄像机穿过目标墙面时只隐藏相交墙组，墙高仍为 2.8m，文档、导航和 use point 不变 |
| 非法摄像机 | 非有限坐标拒绝为 `invalid-wall-camera` |
| 接触资源 | 保留座椅接触句柄后切墙视图并提交无关挂墙物候选，原 seat/back 句柄仍有效 |
| Restore 房间降级 | 当前 roomId 在新文档中不存在时，restore 自动降为 floor 模式并清空 roomId |

## 事务和资源边界

`prepareChange` 生成候选时带入当前墙体观看状态。候选生成后切换 cutaway，再调用 `commit`，提交后的墙体观看仍保持最新状态。提交会重新执行原 authoring 操作的 revision 和占用检查。

活动接触句柄阻止完整文档 restore，并返回 `facility-busy`。墙体观看不释放接触资源，无关设施候选提交也不替换未变化的接触树。句柄释放后，restore 新文档可以继续执行。

`restore` 会检查当前 floor 是否仍存在，并检查旧 roomId 是否属于恢复后的楼层。旧房间不存在时，保留有效 floorId，视图改成 floor，roomId 置空。

## 代码边界

`wall-visibility.js` 仅计算目标射线、墙组和隐藏组。`render.js` 的 `applyPresentation` 将墙体恢复为完整高度和中心，只改变 `visible`，并清空旧 clipping planes。导航仍从完整建筑墙段生成障碍，观看切换不会修改导航数据。

共享墙分组允许法向间距不超过 0.21m，适配两侧各自的 0.1m 墙厚。挂墙物通过墙边、区间和 wall group 绑定。当前探针用程序化挂墙资源避免外部 GLB 加载，外部资产导入和 GLB 接触路径仍需独立浏览器证据。

## 限制

本次是 CPU 模块级验证，不包含浏览器渲染、GPU 性能或用户视觉验收。活动接触句柄在 restore 时被保护并要求先释放，系统不会把旧接触自动重绑定到新房间。
