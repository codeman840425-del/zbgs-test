# 038 最终集成版正常1×同脚本录像

固定构建 `038341558517`，原女性裙装、动态开启、完整修正、原速。只使用既有两份脚本补录最终集成身份；0b旧原片和报告未改标签，未重跑skin或新矩阵，未改产品源码。

| 录像 | wall秒 | sim秒 | sim/wall |
|---|---:|---:|---:|
| 精确二次寻路 room | 5.5570 | 5.4929 | .988465 |
| 同触发固定诊断近景 | 1.5895 | 1.5895 | 1.000000 |
| 坐入—起身—转身—走至空地—完整技术舞 | 19.4317 | 19.3556 | .996084 |

三片运行前后均通过固定构建/身体身份校验，pageerror 0。前两片真实跑任务completed后立即发坐下动作，保留二次寻路.95秒；最后一片sit、idle、turn、walk、dance五请求均completed，含完整7.2秒技术编排。模拟/帧时间、腕部与handContacts轻量记录保留在gzip原trace，无重skin探针干扰。

这批录像提供最终同构建观看材料，没有将旧0b帧表或数值改标为038，也未把数值任务完成当作自然度接受。后续已按另项授权顺序解码本038完整片4fps、77帧7页全部审看，范围及限制见male-boundary/RESULT.md；不是正常速度连续观感通过。可与旧0b、c182、7a86原片观看，独立实际时钟不强制相位同步。room起始wall/sim偏差保留，不宣称无录制性能或普通PC达标。

根报告038集成了独立main时序修复；本次不重新继承/重复其refresh边界与skin门，只验证相同完整录像流程实际完成。旧0b共有refresh问题仍留旧报告，不能将其错误标签带入本构建。

复跑命令（从仓库根，使用新输出目录）：

```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist experiments/hand-scope-worktree-1/qa-snap-video.cjs 038341558517 <新目录>
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist experiments/hand-scope-worktree-1/qa-related-video.cjs 038341558517 <另一新目录>
python evidence/hand-release-038341558517/archive-video.py
```

两个runner退出0并自动关闭其Chrome及临时HTTP服务。GPU已明确交还pose_extraction用于下一项短段回读；本批仅后续轻量JSON/HTML/哈希归档。
