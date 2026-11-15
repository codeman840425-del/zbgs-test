# 269 手部接触：子步成本只读审查

结论：**不建议跨子步复用整个 fitSeatHands 结果，也不建议把它只留在最终渲染子步。** 当前没有证据证明不同子步的作者姿态与碰撞表面相同。找到唯一较小、可明确等价条件的候选是：同一次fit内，左右手投影基完全相同时，复用第二次 projected grid 构建。它不减少任何skin刷新、轨查询、alpha检查、五轮上限或最终复查，预计收益有限，不是7.9ms主成本的解法。本轮只读分析，未改runtime、未新开浏览器或测性能。

核查基准：固定269 trace与恢复提交aed9597。当前main/motion/live/helper/m1-skirt与该提交无diff；foundation-avatar现仅有基础诊断outline可见性4行diff，与本报告涉及的motion/live/garment顺序无关。

## 真实执行链与依赖

1. main.js:1356–1369 以实际elapsed、最大50ms、playbackRate生成模拟时间，`ceil(simulated*120)`个均分子步。renderer.render在全部子步之后才运行（:1395）。所以中间子步没有独立显示，但“不显示”不意味着结果未被消费。
2. 每次simulate先推进模式/导航/yaw，再motion.update（main.js:1560）。motion在:1374恢复**上次作者姿态**，不是上次IK后的姿态；源坐姿Idle仍以actionTime取模推进（:1380–1387），mixer.update(0)后立刻saveAuthoredPose（:1405）。talk/interruption叠加、骨盆与足部修正随后完成，手fit是最后骨骼动作（:2007）。
3. 默认校准前臂/新手分支，不采用旧idle近似cache（motion.js:896–897显式排除）。fit的lastProgress/cacheWeight/idleCache虽写入，默认新分支不会读取旧cache来影响下一次手解；工作区存储/alpha静态缓存会跨步保留。手求解本身主要是当前输入的确定性求解，并非依靠上次已校正腕位逐步积分。
4. profile.seatHandSurfaces(true)会同步normalized→raw、更新矩阵、用**当前骨盆/腿**重新生成裙面，并置garmentPreparedForHands。随后joint refresh采当前raw手骨；skin workspace复制本次裙顶点。每手测量中，作者上臂/肘/腕/指骨方向、腿侧lap目标、sitProgress方向均为当前子步值。
5. fit之后立刻avatar.update（main.js:1572）：live.preUpdate先消费当前校正后的上/下臂/腕作为持麦混合基底；greeting也按dt推进；再vrm.update同步并推进springbones，再live.postUpdate把麦附到实际raw手。故中间手结果确实被live/VRM这条链读取。当前角色的spring collider对腕差异是否存在实际反馈没有本轮专门证明，不应直接断言有或无；泛化等价必须覆盖这条依赖。
6. updateGarment紧接其后，使用garmentPreparedForHands跳过本子步已经做过的同一静态裙计算（foundation-avatar.js:192–201）。这个重复调用已经去掉。裙算法m1-skirt.js:213每次从references与当前腿重新构造，不以_dt积分；但它依赖当前hips/腿/椅碰撞。跳过早期fit会连带改变何时生成裙面、回调标志和测量，不能只删调用而称等价。
7. 足部控制和支撑历史在fit之前完成（motion.js:1945–2005），手只解手臂链，不改变hip/腿。main任务完成、座位释放检查读gait/sitProgress/hip等，未读handContacts。手contact诊断通常只保留最后子步，但其覆盖不是跳过实际求解的依据。下一步作者姿态恢复使上次手IK不会直接累积到下一次源手动作；这也**不能**证明下一次源输入未变化。

## 已有实际trace反例

从归档 `video/actual.json.gz` 选mode=sit且sitProgress=1：128个rAF样本，相邻127对两侧作者肩/肘/腕与最终肘/腕全部非完全相同。作者腕最大相邻变化左1.694mm、右2.253mm，作者肩最大5.967/6.152mm；最终腕最大1.793/.662mm。它是渲染帧日志，不是每个子步日志，所以不能据此报“子步缓存命中率0”；足以否定“坐稳时姿态静止”前提。源代码同时明确每子步推进actionTime/source取样。

整fit跨步缓存若只按requested=sit、sitProgress=1、相同render-frame ID或相同mesh UUID命中，会漏掉呼吸/坐Idle、talk、腿/hip修正、root/yaw、指姿/持麦切换和衣面变化。若严格逐字比较全部输入矩阵/几何再复用，可能代价已超过窄收益，现无命中率证据，不建议先造此缓存。

## 唯一候选：同fit的相同投影基复用

具体位置：motion.js:1062–1077左右手循环内构造outward/gridU/gridV并各build；forearm-contact-workspace.js:37–57重新投影全部triangle并重填cell/list。blend=1时`arm.sign*(1-blend)*.8`为0，左右方向相同；两手的triangle快照在循环前生成，左臂求解不会改这个已复制快照。第二次build因此可能是相同输入。

最小安全条件/实现边界（仅建议，未实施）：

- 复用寿命只限**同一次fit**，下一次fit无条件失效；不跨子步。
- 第二手投影前，严格比较6个基分量（可用Object.is，signed-zero不同就保守重建），所有值必须finite；并保持同一个刚刷新triangle集合，点/顺序/clip/alpha属性未改。
- 相同则保留第一次build后的cells、projected、clipConstants；query仍每轨运行，stamp仍逐查询推进，不缓存任何clearance/候选查询结果。
- 两手测量/五轮/最终复查和source/raw刷新全部照旧。不要把“半坐方向近似”做容差命中；blend<1两侧方向通常不同，仍各build。
- 多实例工作区各自封闭；不得跨实例/不同衣物共用。若未来左手过程可变更碰撞表面，必须失效，不能仅看mesh身份。

数学依据：build只依赖当前points及u/v；同输入给每triangle相同投影/clip常数与相同cell insertion顺序。query中的候选stamp递增不在build重置，所以省掉完全相同build不会改变去重或候选顺序。left求解只改骨骼，当前triangles.points是独立拷贝，不再动态读取骨。

价值判断：269现有内部profile坐稳每帧grid总均值0.42748ms，3.6771次build（每子步2次），总fit7.92578ms、rail/alpha4.79660ms。假设第二次build成本接近第一次，预算约**0.214ms/渲染帧（约fit的2.7%、9.93ms帧间隔的2.2%）**；不是实测收益或严格上限。它不能把两子步变一子步，也不能消掉逐轨alpha主体。若决定做，最多局部Node精确比较同一组投影/候选顺序并一次受影响性能验证；目前优先级低，**不值得以此启动新一轮广泛优化**。

已保留唯一候选及反例边界；没有提出第二套solver、粗采样、跳帧或降低接触频率。
