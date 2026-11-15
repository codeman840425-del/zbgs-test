# 05eb768aadc3：几何等价，但成本仍失败，冻结不合主

仅原女性 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。男性、jaw、waisthip未测，不能继承。主运行时没有改动。83和d01固定构建/失败证据原样保留。

## 已执行与身份

独立源：`experiments/hand-contact-worktree-1`，固定输出 `dist-hand-contact-3`。build `05eb768aadc3`。

- Motion实际CRLF bytes SHA256 `06be7996392924b42a5ba56f91da47bb7a60aff823b8af0280bbd23cabcc0fc1`。
- Helper实际bytes SHA256 `72d555591dda2c27930b3845c70cf15cc0281ad590e78538bd7f3950209f168c`。
- 基础83实际motion bytes SHA256 `f55293dc4d1e965084b43c28f939494a7c13de0d348d355f80f97bf6033b56ab`；安装receipt保存原/候选raw SHA及独立avatar透传变化，正文不把LF hash称原bytes。
- 独立审查未见数学阻断；集成先prepare清旧bounds，每子步采真实skin后再建区间，prepare至查询期间alpha/uv/points不改。每controller独立缓存。

## 事实与几何

- 真实源1024×512 PNG，加斜3D/退化/病态/整数UV边界±ulp/负值clamp/flip/127–128alpha/字段替换检查：133,670查询，通过；证明快捷45,315次，其余回原式。这不是穷举所有浮点数。
- 同build `handAlpha=legacy` 与 `actual`，各lap/authored270帧，共1080实际姿态采集。除elapsed timing与优化counter外，所有捕获字段严格相同，包括source/target/final腕肘、iteration witness、selected真实raw skin、固定腰环。**最大腕/肘差0**。Off路径为保存83算法；没有重新声称原83全量270已测。
- Authored270：524,288实际alpha像素只扫描1次，prepared/proven各231,700，快捷15,220,315查询、4,240边界回退。没有缩轨/放宽alpha/碰撞或减少求解轮数。
- 独立最终实际皮肤×显示裙门槛：100个30Hz采样、2790语义手/前臂三角，0交叉帧，pageerrors0，与83结果一致。仍为有限非共面边三角相交+采样alpha，不是CCD或GPU透明度证明。

## 同条件无录制实际播放：拒绝合入

Chrome157 / Windows / RTX4090，1440×1080，room/authored，dynamics off，真实请求1×；串行无录制，各一组。开发机，不代表普通PC达标。

| 坐稳 | 样本 | 平均帧ms | P95 | P99/最大 | >50ms | 平均子步 |
|---|---:|---:|---:|---:|---:|---:|
| 同build proof off | 63 | 56.281 | 59.1 | 65.6 | 63 | 6 |
| proof on | 64 | 54.887 | 58.2 | 63.5 | 64 | 6 |
| proof on内部计时 | 65 | 54.046 | 55.9 | 62.2 | 65 | 6 |

约2.5%平均差，不能判断有可用性能收益；P95仍明显失败。On的其他阶段P95：站立13.9ms、坐入56.9ms、起身54.5ms、起身后13.4ms。慢帧不只是启动或录制开销。

分项on坐稳均值，除以真实6子步：rail/alpha **4.856ms/步**、新增区间证明 **0.573ms/步**、handSkin0.771ms、handContour0.278ms、skin0.066ms、grid0.241ms、forearmContour0.083ms、diagnostic0.026ms、other1.294ms；总fit **8.187ms/步**。查询仍约109,427 candidate triangles/步。透明度绕过不能消除投影区间/五点深度/大量轨查询；证明开销也吃掉部分节省。总fit49.125ms/帧，累计6步形成持续负担。没有把左右累加timer再相加。

实际simulate/wall：off坐稳0.8884；on0.9110（每帧dt上限使模拟变慢）。因此请求1×不等于始终真实动画1×。

## 失败实际播放与观看边界

`output/playwright/hand-contact-05eb768aadc3/rejected-normal-video-room-1794705081235/authored.webm`

完整坐入/坐稳/起身一段，原room镜头、dynamics off、请求1×、无帧推进。记录300个rAF：实际wall跨度6.7705秒、simulate跨度6.1176秒，整体比例0.9036；rAF P95约54.6ms。录像标为成本失败样例，**不能用低帧/clamp后的动作显慢来假装自然慢放**。本轮未完成该片正常速独立视觉验收；不宣称手臂自然度通过。录制所有browser/临时server已关闭。

## 归档与下一边界

数据：`output/playwright/hand-contact-05eb768aadc3/`，含`alpha-equivalence-{legacy,actual}`、`alpha-equivalence-report.json`、`hand-surface-actual-1794704926403`、`unrecorded-perf-actual-outfit1-alpha-{legacy,actual}`、`internal-profile-actual-outfit1-alpha-actual`及失败片。可重复生成/安装/QA入口在本包scripts与README；不改main。

**本alpha分支停止，不继续叠缓存。** 后续只读评估源手坐标系的真实少量3D轮廓/分段代理与离线手路径编辑，必须保深度、说明手指姿态变化及真实皮肤误差，不能复活被否决的最深平面，也不能从本原女性结果继承派生体通过。
