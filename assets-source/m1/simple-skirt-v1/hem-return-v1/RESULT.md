# 内折裙边源修正 v1：真实自交已定位，局部离线修复

父源layer-transition-v1 SHA `d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa`；新源 `4d005100b4aba7e66710d725fdd6115f7b7d254b5a88e95d46d1ff9a800c1782`。不改body、外裙版型/权重、上腰120面、20点接缝、索引、材质、骨/逆绑定或判定门槛，没有碰撞对排除，没有修改 prototype active-gap/坐姿在制文件。

## 原因与唯一修改

58394实际private-palette站姿中的面2159/2397，对应顶点[1138,1260,1259]/[1258,1380,1379]，无共享或重合点。后者两边分别在t=.9660767/.0346252处穿过前者三角内部，重心分量均严格在(0,1)，交线长0.340628mm。这是实际非邻接穿过，不是UV重复点或合法相邻接缝。

旧构造从outer hem直接向上10mm，径向只内移0.8mm；没有跟随上方外裙向内收的斜率。因而局部返边点越过已收窄的外层。仅改变lower primitive最后121点（1109–1229）：沿对应外裙点→上一环真实侧面上行同样10mm，再以原0.8mm向内法线偏移；权重沿同邻环插值。最大源点位移3.047mm。外裙所有位置/权重/UV保持精确，原120面全部属性保持；相邻裙边法线按新面重算。

1392点/2420面不变，没有删除厚边。source-check记录无面积退化、无相对父源超过90°的面翻向。内环顶点到有限外裙三角的实际距离0.798467–0.800012mm；共享回折边当然从0间隙起，不能把整条返边说成有完整0.8mm实体厚度。源是双面表面条带，不是实体壳或物理布料。

## 完整四姿原门对照

输入为58394完整实际private矩阵/皮肤/椅/旧手层。先用父源独立LBS回读实际捕获并逐primitive断言误差<2µm，再把同一private palette用于新源。以下是**新源离线预测**，未启动新浏览器，不是新GPU通过。

| 姿态 | 自交 旧实际→新预测 | Body | top | 椅座 旧→新 |
|---|---:|---:|---:|---:|
| 站 | 1→0 | 0→0 | 0→0 | 0→0 |
| 坐入 | 1→0 | 0→0 | 0→0 | 0→0 |
| 坐稳 | 95→95 | 194→194 | 0→0 | 98→100 |
| 起身 | 2→0 | 0→0 | 0→0 | 0→0 |

坐稳椅面多2对如实保留，不作为整体改进。坐姿装备响应仍缺，未将此缺失包装为路线定论。新手层未重新拟合，不能继承为最终手接触通过。

自交门沿用零厚度有限三角交叉及原共享顶点过滤，无新增豁免；这不是具有0.8/2mm自碰厚度的模拟验证。身体/上衣2mm预留门完整保留：站姿最小body0.338647mm、top0.095168mm，仍 failed-gap。整体 `status=not-cloth-admitted` 保持失败；坐稳和静态预留都不能因该局部自交消除而升级。

## 源与恢复

GLB第二次从全新目录重生成逐byte一致，见rebuild-receipt。Blend真实保存重开：1392点/2420面、1UV、12 vertex groups及Armature；SHA `cae2b4aca8fc437975162d5d225e65c7b25c24aeb3d2f1a83811ec335ea36ddb`。未声明Blend再导出字节一致。

归属：三个根脚本由audit新增，root可独立stage；本目录由prototype只作独立checkpoint，不混active-gap。生成/检查脚本原样副本随包保存。原脚本应放回 `F:/gamemake/scripts/` 执行，复制件不以本目录作为项目根。

```powershell
# 根目录；目标目录必须尚不存在
python scripts/build-skirt-hem-return-v1.py --out experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1/hem-return-replay
python scripts/check-skirt-hem-source.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/qa-skirt-hem-private.py -- --candidate-dir hem-return-replay
```

校验脚本检查固定候选；private回放支持新的独立输出目录。它读取原 `gate-private-layer-initial.py`，只严格替换输入目录/资产路径与结果basis文字，保留数学、2mm门和四姿；`gate-adapter.json`保存原脚本SHA/替换内容。没有改写原门。`private-palette-prediction.json`保存回读误差及新源身份，`source-check.json`保存实际穿过证明与厚边测量。

所有完整结果与文件SHA见manifest。源许可沿父源既有链，无新图片或第三方动作。新GPU外观、连续动作和布料自碰体积仍未验证。
