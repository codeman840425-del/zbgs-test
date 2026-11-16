# 长发完整骨段碰撞独立 CPU 复核

本报告评审固定提交 3072a3d500f9b3e0fdcd3df1310519f24e2b4081 的长发碰撞补丁，源码 SHA256 为 4ecdcd367fdacb4a9498cca6b7f59af28027f3fc8d0a5200285a75c5c123a1ef，最终检查时该源码无未提交改动。report-wip-4ecdcd.json 与 tested-wip-hair-spring.mjs 保存首次独立反例及当时源码，dirty 字段明确说明该次尚未提交。作者后续固定提交的碰撞源码字节与 WIP 一致。

## 复核输入与方法

- 基线为 5ba8df87ab13c4ae7760c6b19e5b9d6ebd79ab8c，评审工作树为 codex/hair-segment-independent-v1。只新增本目录。
- 使用实际 Three 0.187、three-vrm 3.5.5 模块、公开 createHairSpring 和官方 manager.update。私有 RoomBoxShape 通过实际挂载的 collider.shape 观察，没有复制被测求解逻辑。
- 实际输入来自 evidence/m2-hair-chair-actual-508-v1/report.json 三个世界帧与当前 rootjoin-v2 GLB，SHA256 为 1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385。
- 独立接触证据使用每段 1001 点的盒内深度采样。正深度提供具体交叉见证，零深度只说明此次采样。单盒长度误差另以世界距离直接检查。
- 实际 GLB 三帧都精确回放全部 609 点，replayError 为 0。执行一次 1/120 秒官方求值。头部矩阵冻结，缺少原身体碰撞帧而省略 body colliders。该夹具不能代替游戏重放。

## 观察结果

三帧实际 Pony5→Pony6 的中段跨盒都被单盒修正，长度误差最大约 4.2e-17 米。反射、旋转、非均匀缩放盒的独立样例也保持长度且采样移出扩张盒。零长度采样和完全包在盒内的定长球返回有限结果，暴露 no-fixed-length-endpoint。

共享环境代理的两个 manager 在销毁其中一个后，另一个仍正常更新，其 collider 留存且最终能完整移除。独立 reset 后把 actor 加入共同根节点，公开 manager 依赖刷新可取得正确 colliderMatrix。作者原有生命周期套件另覆盖部分挂载失败、重入销毁与实际 appearance 加载，独立报告未重复全套。

存在受支持输入上的双盒限制。两个互不相交盒分别为 A=[(.4,.2,-.1),(.6,.7,.1)]、B=[(0,.8,-.1),(1.5,1,.1)]，pivot=(0,0,0)，初始 tail=(1,1,0)，半径 .01。A 修正到 (.39,1.3593748563,0)，随后 B 修正到 (1.1729876385,.79,0)，官方求值后骨段重新跨过 A，采样局部深度约 .10969 米。相同长度的 tail=(0,-sqrt(2),0) 可同时避开两盒，所以这是顺序求解的限制。初版 WIP 两个 shape 都返回 corrected-segment 且 unresolvedCollisions 为 0，诊断没有呈现最终交叉。

三帧真实 seat/back 夹具都没有触发上述双盒反例，seat 没有最终骨段接触。真实官方求值后 Pony4→Pony5 端点相对扩张 back 的残余深度为约 .056/.075/.067 毫米。这里比较的是骨段加原半径的数学代理。它与原网格接触深度、正常速度观感分别记录，root 已明确该残差不作为额外修补门槛。

## 边界与后续验收

本次 12 项检查中 8 项成立，双盒保持全部约束及三帧严格零残差共 4 项保留 false。它们分别对应上述顺序求解限制与严格数学代理残差。

本次提供单盒固定长度修正、实际三帧 CPU 回放、所有权清理及依赖顺序的有界证据。当前 lastOutcome 只描述该次单代理投影，不能用作最终多盒无交叉诊断，固定提交没有增加最终审计。作者 implementation-receipt.json 同样记录此边界。该限制是否影响本样件，由 root 的真实完整动作、座椅移动旋转、原网格接触峰值及正常 1× 观看核查。本文没有浏览器、GPU、连续观感或普通电脑性能结论。

从 F:/gamemake-hair-segment-independent-v1 运行 `node evidence/m2-hair-segment-independent-v1/probe.mjs <固定源码工作树>` 可复核。依赖路径指向 F:/gamemake/prototype/node_modules；输入捕获固定指向主仓原报告。report.json 保留全部布尔数学检查，已知限制对应 false 结果未删除。
