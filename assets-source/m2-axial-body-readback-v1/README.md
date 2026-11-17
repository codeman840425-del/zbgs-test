# 完整male-lean组合的有限接触后验

本包只读原62b完整源及新F=G+B数组，不求值B/G，不生成VRM或装备，不改public/runtime。目标为 `male-long-lean-axial-body-v1`。独审组合输入固定为 `evidence/m2-axial-body-compose-audit-v1/result.json`，SHA `ce052ef152bc89cb11e379f0743fd68d31f195073b32a33ec3cb360e436aadf5`。

最终spec SHA为 `3409b4b807dc4a8052cc0aed31911eb23c14e9b9e292bc63bb22b86c6f0dd527`。它绑定真实compose spec、report、raw、完整56records、原源、原55与10结果及其源码、逐混合证据和原strict baseline。新方法不会接受旧head-only数值schema冒充完整身体数值候选。

## 实际结果

整体为 **failed-not-admissible**，没有导出准入。

- 原55状态覆盖完整，候选新增对0。原已有322个state-pair发生项原样单列。
- 10混合覆盖完整，`happy=.65, blink=1, oh=.66` 仍有mouth-skin新增对 `[128,1020]`，其余原新增对情况保持。
- 原2056 Face base以及54个Float32 POSITION delta与已验head-only实际VRM逐字节相同。base NORMAL及54个NORMAL delta也全部相同，共110项数组身份记录。
- 每个真实Float32单端点及每个按原顺序组成的Float64混合碰撞坐标均逐字节相同。role、原三角顺序、表达映射和负eyeJoy补偿索引一致。
- 因此复用原55/10的确定性碰撞结果，没有重复全扫。逐个记录pair的实际坐标/hash已核对，已知新增pair的四组三角witness坐标与旧证据逐值相同，并以未改原strict函数单pair再次命中。

`generated/face-array-equality.json` 保存数组身份，`single55.json`保存各原状态/已有与新增pairs及碰撞/相交对坐标hash，`mixed10.json`保存原权重、角色对、输入hash、全部pair列表和新增witness坐标。`generated/report.json`明确保留已知oh未过，没有因新schema或身体数值成功取消它。

## 检测范围

55单状态仅检测原 `FaceMouth_00_FACE` 对 `Face_00_SKIN`。10混合沿旧源码实际检测mouth-skin、white-skin、white-eyeline、white-eyelash四组。负eyeJoy补偿沿旧函数，在Face_SKIN、EyeWhite、Eyeline、Eyelash索引上减去happy×blink的眼Joy增量。旧函数里CORRECTED/PROTECTED是这项表达补偿的分组，不是新G/B几何保护权限。

完整Body及Face原源端点、Float32数组与JF均载入并绑定独审输入，Body有7855base点且无morph，Face有2056×55端点，共120935。真正传给上述碰撞检测的坐标只有Face组。Body_SKIN自接触、Body对Tops/Tie/Bottoms/Shoes、独立装备、头发/身体/衣物、骨架动作中的接触与连续时间碰撞均未测。没有把Face零新增当作全身避碰，也没有测眼白可见面积、闭眼遮盖或运行观感。

相交函数/阈值保持原源码，已有对和新增对都保留。这里的严格新增对是数值事实，不能从交叉计数单独推定视觉严重程度。

## 执行与恢复

prepare的8项最小检查包括changed delta、漏target、错误补偿mask、triangle编号改变、旧head-only schema拒绝，以及已知oh新增必须保持失败和Face零对不能成为全身通过。prepare未执行contacts。

实际唯一读回耗时约7.66s，含监控启动约10.60s，递归采样峰值111341568 bytes。2线程子进程、600s/3GiB上限。50ms采样可能遗漏瞬时峰值，共享页可能重复计入。execution保输入receipt、实际spec和消费.py快照。exit2对应已知接触未准入，不是执行异常。

```powershell
& experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-axial-body-readback-v1/prepare.py
python -B scripts/m2-axial-body-readback-v1/run.py --execute-once
```

本树不得重跑覆盖。独立检出重演应先将generated及execution完整移到检出外归档，保持原pin输入和源码，再执行同一入口；新执行身份不替代原证据。若未来真实碰撞坐标不一致，代码会对相同限定材料/角色运行原55与10检测，不能复用此包的相等证明。

下一导出、衣物fit和实际游戏检查由root按本失败和检测缺口决定，本包没有把完整male-lean或原八预设标为通过。
