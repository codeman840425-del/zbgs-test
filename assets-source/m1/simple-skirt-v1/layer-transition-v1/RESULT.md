# 原源夹层过渡候选 v1：局部改善，整体未准入

冻结父输入为 v4 `cdd2d206650aa7375b335e42b8cea93dcebea9c9269e360124d198964240c885`；唯一新 GLB 为 `d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa`。没有参数扫描、人体遮盖/修改、上衣删除或门槛放宽。共享运行时和 prototype 在制的坐姿响应未修改。

## 源修改与夹层依据

仅 lower primitive 顶点20–503（四环，v3原行7–10）的 POSITION/JOINTS/WEIGHTS改变；第一primitive原120面（162点）所有属性、全部indices、skin/inverse-bind、material保持精确。lower前20真实接缝点所有属性保持；lower504以后位置/权重/UV不变。法线按新邻面重算，接缝20法线仍原样，邻接固定环的法线允许因相邻面变化而变化。由 `geometry-check.json` 实际解析 GLB 断言，非仅构造时声称。

同高度/角向射线检查484点：全部可找到完整Body和原source三角；363点有上衣侧面，body→top间隔13.371–54.162mm。原source位于该夹层内，距body最小2.795mm、距top最小0.897mm；第四环121点已无该高度top截面。此为有限源点空间检查，不是整面或姿态保证。

将四环点投回原source真实三角，权重取同面重心插值后保留最大4影响归一化；不新增人为碰撞余量。位移包含向内和向外（径向约−13.12到+7.51mm），不是统一缩小。最多丢弃1.9010%权重，风险保留。`source-mapping.json`逐点保留源面号/重心/原始权重/位移/间隙。

LBS对“插值位置+插值权重”的求值不等于对已经蒙皮的三角插值。实算相对后者最大误差：站0.220mm、坐入3.306mm、坐稳5.429mm、起身3.335mm；其中仅剪枝贡献最大分别0.145/1.420/2.864/1.615mm。没有把源投影宣传为所有姿态严格贴合。

## 原门结果（269实际四姿，完整几何）

| 姿态 | Body pairs | top非cap | top原cap | 椅座pairs | 非邻接自交pairs |
|---|---:|---:|---:|---:|---:|
| 站 | 0 | 0 | 260 | 0 | 1 |
| 坐入 .385526 | 0 | 0 | 260 | 0 | 2 |
| 坐稳 1 | 194 | 0 | 264 | 98 | 95 |
| 起身 .451680 | 0 | 0 | 260 | 0 | 1 |

完整 `four-pose-gate.json` 保留失败状态，exit非零。原v4站姿190个非cap top pair归零，是本候选的局部结果，不是整个裙合格。站姿自交 `[2159,2397]` 与父v4面号完全相同且位于未改裙边；未豁免。当前closed-top内部cap继续纳入原门，未隐藏。坐姿装备响应尚未制作，此处只检查原LBS四姿，不能把坐稳失败归结为完成坐姿控制后的路线否定。

## 接续形态风险

零基ring3即第四修改环；ring4是第五固定环。共享环边相邻三角夹角最大：ring3 **9.354°→24.763°**，ring4 **4.592°→17.441°**；原ring5仍1.489°。候选没有面积退化，面法线相对父v4超过90°的面为0，但这不能证明没有硬折观感。新接续折角增大，保留为源质量风险，未自行追加平滑；GPU正/侧/背待root单独查看。此处没有冒称可见硬台阶已排除。

## 可编辑源与恢复

`m1-sixfold-skirt-layer-transition-v1.blend` 实际保存并重开：1392点/2420面、1 UV、12 vertex groups、Armature保留。Blend SHA `5d85137c41156557936f43461f2bf793e538f0c185fdccf2ba8794c38c446e97`。保存/回读不等于重新导出GLB通过。

根工程规范入口：`scripts/build-skirt-layer-transition-v1.py`，依赖 `scripts/audit-skirt-layer-space.py`；两份当时源码原样复制在本目录。复制件是历史源记录，执行时应恢复到根工程 `scripts/`，不能直接以本目录作为项目根。现有v4源、原open-waist、女性VRM/top及269四姿均由报告固定hash/路径关联。`build-report.json` pin输入；`manifest.json` pin全部本候选文件。源许可沿原source已有许可链，不新增许可声明。

实际第二次生成至全新 `analysis/layer-transition-v1-repeat-check` 得到相同GLB SHA；永久凭据 `rebuild-receipt.json` 不依赖该临时目录。

```powershell
# 在 F:/gamemake 根运行，输出必须不存在
python scripts/build-skirt-layer-transition-v1.py --out experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1/layer-transition-replay
python scripts/check-skirt-layer-transition-v1.py
```

Blender使用既有隔离worktree工具，参数为 `assets-source/m1/simple-skirt-v1/layer-transition-v1`（重新生成时换成新目录）：`save-editable.py` 保存回读，`gate-four-poses.py -- --candidate-dir layer-transition-v1` 跑完整四姿，不能添加 `--standing-only` 代替本回执。实际本轮两进程合计约2秒，现已关闭。
