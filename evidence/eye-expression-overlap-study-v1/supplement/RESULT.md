# 分区 Joy：可行，但不能只按名字盲分

原男女都已有 BRW_Joy / EYE_Joy / MTH_Joy。只读全Face及逐材质复算结果：男 `ALL_Joy=BRW_Joy+EYE_Joy+MTH_Joy` 精确成立；女不是逐字相等，6点有残差，最大0.238419 µm。旧诊断与源保持冻结，本补充不制作morph、不修改runtime。

| 原人物 | ALL_Joy | BRW_Joy | EYE_Joy | MTH_Joy | MTH_A |
| --- | ---: | ---: | ---: | ---: | ---: |
| 女 | 3 | 8 | 17 | 31 | 37 |
| 男 | 4 | 9 | 15 | 35 | 28 |

完整实际shape名与VRM0 groups见report：均为相应 `Face.M_{F00/M00}_000_00_Fcl_*`。只有ALL_Joy绑定Joy/happy，三分区没有VRM0 group，因此目前不能仅用 `expressionManager.setValue('EYE_Joy',...)` 实现。

女性残差点423、454、1522、1528、1669、1670，分别落在Skin/White；向量及每材质误差均已保存。Eyeline/Eyelash/Brow/Mouth求和残差为0。男性所有材质所有点0。没有把浮点小残差说成精确等价。

更重要的是语义域并非严格分离：女EYE_Joy还影响22个FaceBrow点，最大0.061810 mm，故直接淡出该target仍会微动眉；男EYE_Joy不动FaceBrow。女MTH_Joy与EYE_Joy还有30个Skin/White非零交点，White上MTH最大0.219671 mm，不能凭“MTH”名字删去其眼周贡献。两性EYE_Joy与当前嘴宽recipe实际非零域、FaceMouth材质、MTH_A非零域交集均为空（逐ID列表见report）。因此可保持嘴/口型，同时需显式保护女眉。

**建议唯一局部分解**，用已识别原目标数值生成两项派生绑定（本轮未生成）：

```
E = EYE_Joy，显式把 FaceBrow、FaceMouth、现有嘴宽实际域置零
R = ALL_Joy - E
P = Basis + h*R + h*(1-b)*E + b*Close + a*A
```

此处E保护是实际材质/既有recipe域，非按坐标大矩形切割。R保留原ALL所有未抑制贡献，包括女分区和不完全相等的6点残差及MTH在眼周原贡献。AA target及权重不改。不直接把整个happy淡出，也不把ALL加上未经约束的负权重交给expressionManager。

一次只读数组核：女/男E剩652/651个非零点；保护域592/590点的变化精确0；b=0时 `(R+E)-ALL` 最大分量误差0。AA支持域与E为空，故该口型位移保持；女MTH/EYE交集处的MTH贡献保留，但眼周最终位置会按目的变化，不能宣称全脸所有MTH非零点位置不变。

这证明POSITION层面的最小局部适配可行，不是已实现或视觉通过。现有runtime没有分区组，需在角色装载时针对精确源身份建立派生表达绑定；保持每实例隔离、reset/dispose及换几何后的相应数据一致，不能直接写永久几何。本轮未评估派生法线混合、Float32新buffer量化及正常眨眼/注视画面。Eye端点新增NORMAL目标的处理也必须同步核对，不因POSITION等价推定灯光相同。root决定下一次最小实现与男女实看；没有提出新捏脸路线。

复跑：`python evidence/eye-expression-overlap-study-v1/supplement/partition.py`。依赖及源码hash在report/manifest，旧诊断manifest逐项核验未变。无GPU、无源写入。
