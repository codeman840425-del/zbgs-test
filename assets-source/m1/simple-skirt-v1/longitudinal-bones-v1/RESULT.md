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


## 方法决定与最小下一项建议（仅建议，不实施）

源固定带在本样件中精确保留，其实际坐姿全固定面body/top/chair交叉均0；此次失败先发生在自由作者坐姿曲面、周向材料分配和层间可行性。不是增加人体权重、再加几根骨或把坏目标拟合得更准即可修复。18骨本身的游戏表达及成本尚未测，不能将本次作者目标拒绝记为18骨运行时失败。

如果必须保留当前封闭细褶短裙版型，现缺的是一个真实站坐均合理的作者裁片/坐姿表面，而不是加载器功能。现有Blender源、形态键、GLB POSITION/NORMAL导出与实际回读能力已经具备；此前不足的是合格形状输入。因此不建议再按旧环列或碰撞投影自动猜同款目标。

最小下一方法建议：独立选择一件**允许真实侧开衩的短直筒裙**作为受限款式，在真实坐姿上先制作完整前/后裁片及侧缝终点，再以同一材片长度制作站姿Basis和单坐姿Shape；开衩允许前后片沿不同支持面分布，避免仍要求闭合环把大腿上片与臀座下片硬连成一圈。保留真实内衬和完整身体，不将开衩等同删身或遮挡修复。该款式是新候选，不能代替用户批准原版型。此项未实施，且不承诺一定解决上衣层序。

需要的具体输入/能力：当前女精确SHA、真实站坐body/top/chair（本包已有）；一份明确坐姿侧缝/前片长度的服装参考或许可可编辑裁片源（当前没有合格者）；Blender可编辑裁片/桥接/局部比例编辑/Shape Key（工具已具备）。制作由技术团队完成，用户仅观看款式和露肤范围，不要求用户操作DCC。若不能先取得可信裁片参考，优先寻找带可编辑坐姿形变的合法裙资产，不再凭当前失败ring参数猜测。任何现成资产仍须精确体型适配与完整材质同姿验证，不能凭供应者演示继承通过。

现存可观看失败对照保持：[shared-column实际GPU结果](../local-retailor-shared-columns-v1/gpu-preview/RESULT.md)，其目录保留parent/candidate的front、side、room六图，固定58394同姿真实材质；它不是本次038作者目标的可见证明。新目标当前只提供可编辑Blender失败源，没有假冒完整材质GPU验收。
