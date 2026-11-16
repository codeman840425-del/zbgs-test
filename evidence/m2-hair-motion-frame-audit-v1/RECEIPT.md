# 长发运动参考系有界定位

当前 world-space tail 历史足以在等速根平移中产生持续后仰。保留实际资源、原参数和原身体碰撞代理时，CPU 发梢方向从离世界竖直向下约 15.10° 变为 69.11°，停止后回到 15.10°。使用官方 `joint.center = vrm.scene` 或角色 actorRoot 后，纯根平移的结果与静止结果的关节四元数分量差最大约 1.54e-14。没有修改 runtime、fit 或物理参数。

## 输入与固定身份

- 源提交 fa9c3557b6d65d81bab0ec1891ecbc5ce7861d32，hair-spring.js SHA256 为 4ecdcd367fdacb4a9498cca6b7f59af28027f3fc8d0a5200285a75c5c123a1ef。
- 实际 rootjoin-v2 GLB、fit、原女 VRM、8b3 contacts 报告的 SHA 保存在 report.json。加载完整真实骨层级和几何，纹理解码用 1×1 CPU 占位，不参与本次动力学计算。
- 使用实际 Three 0.187.0 与 three-vrm 3.5.5。基础对照保持 fit 中全部六关节、原半径、stiffness .8、gravityPower .04、dragForce .6 和三个身体代理。房间代理在此基础对照中省略。
- dt 固定为 8b3 pants-seat 的实际帧间隔中位数 0.0061 秒。角色前 2 秒静止，随后以现行走速度 1.05 米/秒沿世界 +Z 匀速 4 秒，再停止 4 秒。每个 center 使用相同输入。另以同一参数输入头部相对身体的周期俯仰，验证保留下来的骨内运动。
- center 只在测试进程里拦截官方 addJoint，在首次 reset 之前赋值。调用的 createHairSpring 源码与固定工作树逐字节相同。

## 结果

| 参考系与运动 | 约 5.905 秒离世界竖直角 | 发根到梢直线长度 | 六段总长 | 停止约 1 秒后角度 |
| --- | --- | --- | --- | --- |
| world，静止 | 15.096° | .409411 米 | .432354 米 | 15.096° |
| world，等速根平移 | 69.111° | .429773 米 | .432354 米 | 15.105° |
| actorRoot，等速根平移 | 15.096° | .409411 米 | .432354 米 | 15.096° |
| vrm.scene，等速根平移 | 15.096° | .409411 米 | .432354 米 | 15.096° |

world 模式在约 2.104 秒达到 35.21°、3.001 秒达到 69.11°，之后匀速期间维持。停止后约 .1 秒仍为 65.68°，约 .5 秒回到 20.14°，约 1 秒回到 15.105°。总骨长保持，持续后仰来自方向变化。

头部相对身体俯仰时，三种 center 的对应输出仍有动态变化，约 5.905 秒角度为 17.29°、直线长度为 .389742 米。actorRoot 与 vrm.scene center 保留该头部运动。该夹具的 raw 骨架与身体碰撞代理来自真实原女静止姿态，未回放实际行走动画。

## 官方积分语义

three-vrm-springbone.module.js 的 VRMSpringBoneJoint.update 位于约 662–680 行。其运算顺序是先在 center 空间执行 `current + (current - previous) * (1 - dragForce)`，再转到世界，随后加上 `worldSpaceBoneAxis * stiffness * dt` 与 `gravityDir * gravityPower * dt`，约束长度、处理世界碰撞，最后把新 tail 存回 center 空间。center 为 null 时，两次坐标转换均为单位矩阵。

这套实现的 dragForce .6 每步把历史位移乘以 .4。stiffness .8 和 gravityPower .04 分别直接乘 dt 后添加世界位移，没有质量项或 dt 平方。配置值不能直接当作 SI 弹簧常数或 9.81 米/秒² 重力。dt 由游戏实测毫秒转换为秒，长帧还经现有上限及 120Hz 子步处理。

在 world center 下，tail 历史以世界位置保存。角色每步前移时，当前骨根改变，而旧 tail 不随根平移。即使随后 tail 已跟随角色等速前进，历史位移仍每步被 .4 阻尼，形成持续的速度相关滞后，由 stiffness、gravity 和长度约束共同平衡。这个算法机理与对照中的持续后仰一致。它不是仅在启停加速时出现的惯性响应。

使用 vrm.scene center 后，历史 tail 随该场景的当前整体变换转回世界，因此消除整个人物根平移及旋转对这份历史的影响，也消除根启停、加速与转向产生的惯性滞后。身体骨骼相对 vrm.scene 的平移、旋转和 head 动作仍改变挂点及碰撞代理，继续参与模拟。该方案不模拟整个人物根运动的惯性，未加入加速度补偿。

gravityDir 在转回世界之后添加，因此仍是世界方向。配置中的 [0,-1,0] 保持世界向下，不能再手工先乘 center 逆矩阵。存回 center 的步骤已执行对应转换。stiffness 方向也由当前骨与父世界矩阵取得。

## vrm.scene、actorRoot 与接入顺序

当前 foundation-avatar.js 约 123–128 行在 rotateVRM0 后将 vrm.scene 的 Y 减去 sourceFloorY，再把它放进 actorRoot。原女本次实测 vrm.scene 局部位置为 [0,0,0]、旋转为 Y 轴 180°、缩放为 [1,1,1]。其他资源可有登记的静态高度偏移。

这类固定模型偏移与方向差不改变两种 center 对同一纯根运动的结果。当前动画 track 驱动 normalized humanoid 骨骼，包括 hips 相对位移，随后同步到 raw 骨骼；它们不是修改 vrm.scene 本身。因此 vrm.scene center 保留这些身体局部动画。若未来直接动画化 vrm.scene 自身，vrm.scene center 会连同该层运动一起排除，actorRoot center 的语义届时会不同。

最小接入点是 hair-spring.js 约 217–219 行，在创建每个官方 joint 后、addJoint 与首次 reset/setInitState 前设置 `joint.center = vrm.scene`。对已初始化的 joint 改 center 需要重新 reset，避免把旧世界 tail 当成新局部 tail。

维持当前调用顺序即可先让动作与 live preUpdate 写入骨骼，再执行 vrm.update 的 humanoid/raw 同步和原 VRM 更新，随后调用外部长发 manager，最后执行既有 root 世界矩阵刷新及 postUpdate。center 为骨链祖先，官方 manager 已通过依赖排序刷新祖先矩阵。本次分别有无显式全树预刷新都重现 world 模式的 69.11°，因此矩阵顺序错误不是产生该后仰所必需的条件。两种顺序仍有小的瞬态差异，world 模式四元数分量差最大 .00745、方向分量差最大 .00152，不能声称全部求值逐位等价。actorRoot center 对照中，预刷新与否的四元数差约 4.50e-14。

## 受影响的世界椅盒坐标检查

按 root 指定追加唯一的房间坐标检查，使用实际 508 中间捕获姿态和 seat/back 矩阵、原六关节参数，并省略未捕获 raw 帧的身体代理。一组 actor 根平移而椅子保持世界固定，对照组保持 actor 根不动、把同一椅子变换到 actor 局部等价位置。再加入绕人物锚点 .2 弧度 Y 转向，重做相同等价比较。两组均使用 vrm.scene center，world gravity 的 Y 方向在此等价变换下保持。

平移及平移加转向的骨世界坐标等价误差分别为 1.37e-15 和 1.81e-15 米，全部实际 colliderMatrix 与椅子当前 matrixWorld 一致，发生两次实际骨段碰撞修正。center 改变存储历史坐标，没有把世界椅 OBB 当成 center 局部数据。该检查提供坐标一致性证据，不宣称椅子所有时段无穿插。

## 证明边界

本次证明原参数下 world 历史加等速根平移足以造成持续大角度后仰，并证明官方祖先 center 可消除该项、保留身体局部 head 动作。它没有逐帧重放 8b3 视频中的真实动作、碰撞及路径，不能据此归因所有回卷或入座上甩，也没有证明接入后的正常速度自然度。root 将以同链完整 1×、实际椅接触与动作检查验收。

仅新建本目录。可从本工作树运行 `node evidence/m2-hair-motion-frame-audit-v1/probe.mjs`。依赖与原捕获固定读取 F:/gamemake，运行前检查被调用 hair-spring.js 与本工作树源的 SHA 相同。report.json 保存完整参数、方向、长度、四元数和椅盒检查，summary.json 提供较短数值输出。
