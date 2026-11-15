# A最小准入：唯一源fit未达静态间隙门，停止

来源是已有open-waist/open-top与静态fit，不重新切孔、换cage或运行原生cloth。此目录不替代CAP能力状态。新样件没有合入游戏、没有正常速度动作验收。

## 先量化保存的三帧失败

旧碰撞厚度和为0.3mm（0.2mm布+0.1mm碰撞体，10倍作者单位后还原米）。全裙初始最近距离body0.4664215mm、top1.0013810mm，分别多0.1664/0.7014mm；它们**容得下静态厚度和，不等于动态有足够余量**。

更关键的是：旧第3帧的裙face253/494 × body824/826不在那个全局最近处。其初始相关顶点离body至少6.864mm，面内采样至少5.856mm；第3帧顶点仍在外，最近0.922mm，但长39–41mm的边/面内出现−0.172mm有向距离采样，native BVH已确认4对实际相交。局部最大向内法线位移6.454mm。样本位于hips-local约X0.082–0.096、Y−0.009–0.030、Z0.061–0.079的上臀区域。

这支持“粗面跨曲面，而各顶点仍留在碰撞体外”的具体机制；并非仅因为全局0.466mm太小。只把全局间隙改成2mm不能承诺稳定。此有向采样基于最近三角法线，非精确全局穿透深度或CCD；所有历史原形保留。

## 唯一冻结规格与实际结果

`fit-plan.json`是开跑前固定的规格：身体—裙与裙—上衣全局≥2mm；历史失败两个面局部body间隙≥8.5mm；实际裙/上衣各新增源位移≤6mm；保原拓扑、UV、权重与身体，真实20点腰孔全pin、沿网格测地25mm释放。原cloth质量/刚度/厚度和接触/材料门均未改。

2mm是静态工程余量，8.5mm来自保存轨迹约6.454mm向内位移加约2mm余量，**都是这一次源空间假设，不是物理稳定性证明**。新作者源采用12轮有界实际表面采样构造，仅输出这一个候选；没有尝试第二组距离或增加迭代。

| 原静态门/冻结源门 | 此次结果 |
|---|---:|
| 全部实际body/top/其他保留衣片相交 | 0 |
| 非邻接自交 | 0 |
| body精确近三角最小间隙 | **1.219370mm < 2mm，失败** |
| top精确近三角最小间隙 | **1.741704mm < 2mm，失败** |
| 历史失败两面局部间隙 | **7.819149mm < 8.5mm，失败** |
| 裙最大新增源位移 | 2.548446mm |
| 上衣最大新增源位移 | 3.516788mm |
| 原边长相对静态fit最大比 | 1.027987（不是cloth动态材料检查） |
| 最小原边长比 | 0.811237，局部压缩改变需视觉审查 |

精确距离使用与旧native gate相同的vertex-face及edge-edge距离；全局AABB预筛3mm、局部12mm，0.1µm只用于浮点舍入识别，不放宽2/8.5mm目标。fit计算0.516秒、native门0.843秒，属于作者操作时间，不是游戏性能结论。

**静态准入失败，未运行那一次60帧原生短试，更未运行完整cloth。** 七点面采样构造没有满足精确面间距，不能用采样“差不多”替代门；也不能由本次失败推出6mm源预算数学上绝无可行解。按一次尝试限制停止，不继续调参。

## 真实源与视觉代价的边界

`source-fit/source-fit.blend`与`fit-result.json`保存真实裙/上衣新表面及完整未改身体，只有真实服装顶点移动。原开孔加权GLB不覆盖，UV通过原render索引保留，权重仍精确引用原开孔GLB，未重新拟合。Blend是作者姿势几何与新pin检查点，**尚不是新骨绑定运行时GLB**，不能拿它宣称装备导入闭环完成。

潜在视觉代价是腰/上臀真实衣片约2.5/3.5mm的松量变化及局部边压缩，不是放大碰撞代理。此次静态门已失败后没有追加渲染或产品录像，未观看其实际新轮廓；故只报告量化位移，不称“肉眼无差”或“风格不变已验证”。

## 输入与恢复

`input/*.gz`共1.38MB，保存精确历史0df静态完整人体/衣物输入及standing-open-v1三帧结果，manifest包含源路径及压缩前后SHA。它们是历史作者输入，不冒充当前abdb运行。旧source rest、开孔GLB、源UV和绑定仍引用`../offline-corrective/open-waist-v1/`。

```powershell
python scripts/m1-assets/restore-cloth-admission-input.py
python scripts/m1-assets/analyze-cloth-admission.py
# 输出是已拒绝的作者样件；默认拒绝覆写已保存结果
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/fit-cloth-admission.py -- --out experiments/cloth-admission-readback
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/validate-cloth-admission.py -- --source-fit experiments/cloth-admission-readback
```

最后一个命令预期以失败退出。不得因此改阈值。此记录无需启动浏览器；任何后续原生短试都没有获得本样件静态准入。
