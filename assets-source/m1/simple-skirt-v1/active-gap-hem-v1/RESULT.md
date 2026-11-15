# 活动层间隙 + 内折边：明确组合，仍非坐姿完成

新ID `m1-sixfold-skirt-active-gap-hem-v1`；GLB SHA `8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157`。

父层源d7b5a881…、active148ad6a3…、hem4d005100…分别保留，不覆写。组合没有再拟合参数：逐属性断言位置30/121点、法线423/242点修改集合完全不重叠。只有hem末121点权重（其中42点joint索引）是其已记录构造修正；active保持原权重。所有UV/索引/材质/骨及inverse-bind保留，上腰120面和20源接缝点所有属性保留。不能写整个zipper位置精确不变：active的5点low87/94/99/135/136在新ring0，也参与zipper外沿；它们已纳入四姿全衣门。许可沿原源链。

## 同一完整门重新检查

冻结58394实际private palette，独立float32 LBS回放；两primitive完整显示面、完整body/opened top/真实椅和自交均检查。原body/手轨迹未由新装备闭环重算，因此下表是离线源诊断。

| 姿态 | body / top / chair / self |
|---|---:|
| 站姿 | 0 / 0 / 0 / 0 |
| 坐入 | 0 / 0 / 0 / 0 |
| 坐稳 | 192 / 0 / 100 / 95 |
| 起身 | 0 / 0 / 0 / 0 |

活动域面260–2419站姿实际最小body2.114486mm、top2.009992mm，原2mm门通过。固定zipper仍body0.338647mm，**全衣2mm预留未通过**。新组合只提供以原上腰及新安全zipper为固定作者域的初值，不宣称全衣静态间隙或动作合格。坐姿装备响应未做；不能将无响应的坐稳失败说成方案已完整实施后失败。

源边长比0.8284–1.1984、面积比0.8000–1.2787（相对hem父源，即隔离active修改）。没有新闭环GPU、连续动作、cloth稳定或视觉通过。Blend已真实保存重开，仍是可编辑源而非动态成功样片。

门适配器仅替换候选身份、输出路径和属性参照父源为hem；完整距离、BVH、自交、2mm条件及分区不变。`gate-adapter.json`保存实际运行的原检查脚本SHA及替换。之后规范wrapper只增加独立输出参数，不改变几何判定。

## 重建与下一项

在本隔离worktree根运行：

```powershell
python scripts/m1-assets/simple-skirt/combine-active-hem-v1.py --out assets-source/m1/simple-skirt-v1/active-gap-hem-replay
& F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/gate-active-hem-v1.py -- --out assets-source/m1/simple-skirt-v1/active-gap-hem-replay
```

目标目录必须新建；原各父源SHA会严格校验。规范生成器及检查器原样副本随包，恢复时须放回scripts规范相对路径。完整输入在`private-layer-initial/capture.json.gz`，原始生成逻辑/材质/来源沿三个父包可追溯。

下一项仅限`AUTHORING-TRIAL-SPEC.md`所述一次离线短坐入作者试验，**尚未捕获连续输入或执行仿真**。必须先明确原动作逐帧输入、固定/自由边界、材料位移判法和CPU窗口；不自动增加cloth迭代、候选版型或实时系统。
