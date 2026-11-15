# 6×3 纵向分节：首次作者目标前置失败，停止绑定

这次尚未生成可加载的18骨装备。与旧六个单刚体扇区不同，保存了六扇区、每区三纵段的作者控制布局与连续周向/纵向权重输入；但在绑定/导出之前，单坐姿作者曲面本身失败。因此不再拟合、不接runtime、不制作第四组角度/权重，不宣称该路线已通过或普遍不可行。

输入为固定038341558517实际站/坐入/坐稳/起身，原女027bed60…及原上衣；原open-waist裙a5de096b…（已有源开腰处理，非此次删面）。完整身体Bodybaked7732面由精确原VRM index恢复，252面显示覆盖不参与碰撞豁免。源材质、UV、位置/拓扑与原件均保留。许可沿原制服来源，派生不标CC0。capture第一次旧ID找不到source失败，修改查询为实际Equipment裙对象后成功，未改变游戏。

作者规则一次固定：对真实下躯干/大腿径向截面建立外侧支撑折线，2mm作者余量；每扇区按原源轴向长度取3段弦，18个刚体段变换以周向/纵向连续权重混合。原hips-local y≥.09固定带沿原完整skin，free侧30mm过渡。这里sourceLengthM是轴向深度，不是已证明沿面材料弧长；不能据此宣称原裙长度数学上不够。没有旧guide、nativecloth或参数优化器。

完整原始三角门：body164对，上衣202对，座面62对，自交12对。所有事件涉及自由区，固定带及固定/自由混合面均无这些事件；固定点误差1.57e−16m。最大边230→234，前中部自由区，19.381mm→30.080mm，比值1.552039>原1.25门；两端free blend均1，不是上腰平滑带拉裂。

这证明本次“外侧支撑折线压为三段弦＋保留原pleat偏移＋周向权重混合”的作者布局不合格。支撑点在外不保证弦、渲染三角及扇区间过渡在外。尚未证明6×3骨的全部可编辑作者能力不够，也没有可行目标供其拟合。因此按预先停止条件冻结。GPU完整材质站/坐对照、真实18骨绑定、性能和动作均未执行；不能以Blender文件存在代替这些结果。

文件：

- `input-038/four-poses.json.gz` / manifest：当前真实输入，含source/display裙、raw骨、完整碰撞位置与椅变换。
- `author-target-v1/author-spec.json`：18控制、六条支撑路径、明确来源、固定域及长度语义。
- `author-target-v1/author-arrays.npz`：原源、作者目标、权重18列、free过渡、完整body index。
- `author-target-v1/geometry-gate.json`：全pair列表及最大边/固定域分类。
- `author-target-v1/rejected-author-target.blend`：原GLB材质源、实际房间坐标的失败目标、18条可编辑控制布局、完整body/top碰撞对象。控制布局未绑定，文件明确标注NOT_BOUND。

重放（隔离worktree，输出必须不存在，不覆盖本失败）：

```powershell
python scripts/m1-assets/simple-skirt/author-longitudinal-v1.py --out assets-source/m1/simple-skirt-v1/longitudinal-bones-v1/replay-new
& F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/gate-longitudinal-v1.py -- --out assets-source/m1/simple-skirt-v1/longitudinal-bones-v1/replay-new
python scripts/m1-assets/simple-skirt/diagnose-longitudinal-v1.py --out assets-source/m1/simple-skirt-v1/longitudinal-bones-v1/replay-new
```

不修改主线runtime/控制器/源素材或公开入口。后续方法决定归主代理；本包不自动启动新试验。
