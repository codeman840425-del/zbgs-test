# 少褶独立源样件：v3站姿仍未准入，尚未制作坐姿装备响应

只在`experiments/m1-simple-skirt-worktree`（基于aed9597、初始源码精确269a73423c97）制作。共享默认原裙、人体、动作、控制器、材质及运行时未改。本文是失败试验记录，不是能力状态表；当前能力仍以主工程CAPABILITIES为准。

## 产物与实际执行

三版均2057渲染点/3840三角、120周向分段×16纵层及真实内折裙边；原6辅助骨+hips新作者权重，最多3个非零影响，仍使用源12骨skin及inverse-bind。独立GLB、真实保存再打开的Blend、UV、vertex groups与Armature均保留；源读写检查不等于实际游戏装备加载/动作已通过。没有安装新装备adapter，没有正常1×新裙影片。

| 版本 | 唯一变化 | GLB SHA256 |
|---|---|---|
| v1 | 首件6宽浅褶源；含已查明的截面外推制作错误 | `78b955bc02d180644665f82aa71ed1bab2a26d228c6a0b1c6b3ffeebc24e0602` |
| v2 | 非等高腰/下摆归一化取完整环，每层真实中心；不变权重、余量、门 | `344df050faf46b86deb7042f2cd7cb8013da70d8ebf04e6907d7dbd8098b0661` |
| v3 | 仅取消前19%裙长错误的腰半径保持；第一腰孔原样 | `6ba760182b8f7ad8246f49fccf8821ab0a4742a53b65af9844dc08cdfc478a72` |

`v2-v3-attribute-check.json`确认UV、JOINTS、WEIGHTS、indices、第一腰圈、全部Y逐值相同；605点XZ改变，最大15.539mm，是源轮廓错误修正，不是新增碰撞余量。各版独立ID/fitId，没有伪造原裙GLB版本。程序新网格/参数及原源许可沿`assets-source/foundation/source.json`的既有CC0来源链；没有新图片素材。

## 真实输入、绑定与制作错误分开

`input-269/four-poses.json.gz`保存完整body/top/原source及display裙、raw全骨矩阵、椅OBB和身份。由固定269真实控制器推进，dynamics ON、authored手、full修正，坐进度0/.385526/1/.451680；原始15.63MB/gzip5.40MB，压缩前后SHA见input manifest。不是旧175输入，也不是新裙手层闭环：当前手姿是原裙求值结果，换裙之后必须重新运行手接触。

旧source裙在这些实际骨矩阵下的独立LBS回读最大0.460µm；新资产继承的所有骨`restWorld × inverseBind`最大矩阵误差2.33e−9。排除了本次新源rest-bind坐标错配，**不证明新作者权重适体**。

v1错误是把倾斜腰线/不等高下摆的开放水平截面当完整椭圆，并固定腰中心外推所有层。原y=.73截面只有前半圈；导致前缘Z−.220m，明显偏离原−.137m。v2改用真实腰/下摆之间完整层，前缘−.136m，闭环覆盖有显式检查；v1原失败/图片/源码保留。

v2仍有`blend=smooth(t/.19)`将新层半径拉回腰圈，导致上腰窄带入体。代表v415/raw row3的真实body315最近法向−2.993mm；同一点同权重同余量只取已有完整层XZ，变+3.194mm。117负向顶点采样均变非负；这是离线点反例，不能替代实际面门。批准的v3只修这个源半径保持，未改门。

## v3站姿实际面门与可见性

仍失败：body36对（仅4个腰部表面，骨权重主要Chest），top506对，非邻接自交1对，椅0。body余下3个负向顶点采样，最深0.207mm；v292位于hips-local[-.08819,.12669,-.00077]，最近body304。是有向最近三角法线距离，不是完整闭体穿透深度。自交为裙面3579与内折边3817，需要制作诊断，未悄悄排除。

上衣已单独复用**现成open-top SHA7f266f…**做同姿检查，没有移动其余顶点；1405幸存点独立LBS与269对应原点最大误差0.446µm。506中210是已知内部cap；去cap后**仍296个侧面事件**。因此不能把尚未切换open-top的210混成新裙失败，也不能用它解释剩余露片。

同姿、同镜头、完整body/top/chair的离线纹理alpha+深度图确认：v1站姿明显前鼓，v2/v3前鼓修掉，但前腹黑色裙片仍露过背心、上衣下摆有锯齿状层序交叉；六宽浅褶在当前图上过于平整，不是自然裙成品。它们是离线真实几何图，不是游戏GPU/MToon截图，不代替正常播放。

open-top后的有限交点端点/中点alpha+1mm深度诊断：36 body pair在正/侧图均被衣物挡住；296 top pair均有alpha有效采样，其中正面257/侧面28对存在可能外露采样，红点对应可见前腹/下摆交叉。不能据有限两视角证明身体隐藏面可全部豁免，也不能把257说成257个肉眼洞；原接触门没有改变。

关键图位于`generated-v3/open-top-standing-{front,side}-{original,candidate,crossings}.png`。所有旧cap前图仍保留；同姿索引见`index.html`。

## 原source上腰的可复用边界

对照的是原始真实SkinnedMesh，不是旧guide显示裙。以原上衣侧面（排除cap）最低bind Y=.889923m划出保守潜在覆盖带，跨边界三角计入，去原裙cap/上衣cap后：

| 同269姿势 | 原source上带 body/top | v3上带 body/top |
|---|---:|---:|
| 站 | 0 / 16 | 36 / 296 |
| 坐入 | 0 / 5 | 178 / 117 |
| 坐稳 | 89 / 3 | 228 / 87 |
| 起身 | 0 / 3 | 198 / 128 |

覆盖带包含上臀/一部分腿区域，坐稳89不能直接称腰孔本身穿模；也不能称原整个上带全动作合格。面数不同，不作百分比修复率。`source-waist-comparison.json`保留原face ID供后续精确划边界。

原带平均权重hips59.89%、spine17.90%、chest8.99%；新hips90.48%、spine/chest0（两网格采样密度不同，均值只解释绑定结构差异）。在完全相同20个原腰孔点上，仅换hips-only会使站姿最大差9.77mm、起身16.32mm。相对背心的运动确实被改变；这20点仍在body外，不能把所有缩窄穿插都归权重。**建议后续优先界定并保留原上腰精确版型/权重、只重制下摆和真实接缝，而非重造整个腰口。此处不自动生成v4。**

## 坐姿缺失不是路线否定

v1/v2裸LBS坐稳裙落到腿下且碰椅，图清楚显示。六辅助骨均直接挂大腿，没有下摆分节链；此次尚未制作该装备的坐姿骨响应或作者shape。因此它是“静态适体未准入且坐姿响应未实现”，**不是经过坐姿控制制作后证明少褶路线失败**。完整坐起、走跑、舞蹈、取消、同帧手重算和实际运行成本均未测新装备。原控制器/身体/完整动作范围未被缩减。

## 重放与恢复

所有入口在仓库根/指定隔离worktree执行。当前脚本有独立worktree目录保护；不要移去共享运行时执行生成。使用**不存在的新输出目录**；失败gate默认拒绝覆写结果。

```powershell
python scripts/m1-assets/simple-skirt/build.py --spec parameters-v3.json --out assets-source/m1/simple-skirt-v1/replay-v3
& <Blender4.5.9>/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/save-editable.py -- assets-source/m1/simple-skirt-v1/replay-v3
& <Blender4.5.9>/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/gate-four-poses.py -- --candidate-dir replay-v3 --standing-only
python scripts/m1-assets/simple-skirt/render-four-poses.py --candidate-dir replay-v3
```

gate非零是当前真实预期，不能为重放改阈值。Python生成/离线图需NumPy/Pillow；Blender保存/实际BVH使用4.5.9自带NumPy/mathutils。`capture-four-poses.cjs`复用项目fixed-check和Playwright；需显式269 SHA/asset guard，`QA_RUNTIME_ROOT`可指定已安装锁一致依赖的工具根。保存输入已自包含，日常重放**无需再次捕获浏览器**。bind/waist/source对照、open-top检查脚本只产生诊断报告，不生成新版本。


## v4 checkpoint：复用真实上腰，尚未准入

保留原 source 开腰后 BFS 环 0–3 的 **120 面**，位置/拓扑/UV/法线/权重逐项不变；该实际结构边界在原 269 四姿完整 body/open-top 门均 0。更宽覆盖带的原 16 top / 坐稳 89 body pair 不在这块保留区，不自动判为内部合格。

20 点真实边界通过角序 zipper 与新下摆连接，非重叠自由拼片。两 primitive 合计 1392 顶点/2420 面。边界副本全部属性完全一致；新下摆前三层混合源边界权重与新作者权重，四影响剪枝最大损失 **4.4297%**，绑定仍需实际验收。当前站姿完整面 body 0 / 原 closed-top 400 / 椅 0 / 自交 1，仍失败；top 内部 cap 与可见层序尚待 GPU 分类。自交为已知内折裙边问题，没有排除。

GLB SHA `cdd2d206650aa7375b335e42b8cea93dcebea9c9269e360124d198964240c885`。Blend 已真实保存/回读，凭据 `generated-v4/editable-readback.json`。没有制作坐姿装备响应，不能把现裸 LBS 坐姿失败等同路线被验证不行。隔离 adapter 正在制作，将用两个真实 SkinnedMesh 与六个装备私有 palette 骨，不用旧 guide，未完成运行验收。原默认装备不替换。

## 精确重建与历史保留

已在 fresh-output 实际执行 v1/v2/v3/v4 重生成，四份 GLB 均与各自冻结产物逐字节一致，见 `rebuild-receipt.json`。当前通用 `build.py` 配合相应 parameters 可重建 v1–v3；当时脚本另存 `generated/frozen-build.py`、`generated-v2/frozen-build.py`，不能把后续脚本 SHA 写成当时生成身份。冻结脚本依赖 canonical 路径 parents[3]，如要运行历史脚本应在独立副本替换 canonical script，不能在 generated 中直接运行。

v4 从冻结 v3 下摆和原 open-waist 源构建，含真实连缝：

```powershell
python scripts/m1-assets/simple-skirt/check-package.py
python scripts/m1-assets/simple-skirt/build-v4.py --out assets-source/m1/simple-skirt-v1/replay-v4
& <Blender4.5.9>/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/save-editable.py -- assets-source/m1/simple-skirt-v1/replay-v4
& <Blender4.5.9>/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/gate-four-poses.py -- --candidate-dir replay-v4 --standing-only
```

必须在名为 `m1-simple-skirt-worktree` 的独立检出中运行；生成拒绝覆写已有输出，不写共享 prototype。门失败保持非准入。v4 两材质不能直接套用旧单材质 CPU renderer；实际 GPU 诊断另记。离线 CPU 旧图使用 nearest/clamp、双面与阈值深度，257/28 等采样不是实际 GPU 像素门。

源包 `package-manifest.json` 记录全部冻结输入、脚本与外部追踪依赖原始 SHA；`.gitattributes` 保留 raw 字节。派生许可沿原制服来源与既有 provenance，未重新声明为 CC0。此 checkpoint 只为失败和在制源可恢复，不是装备/坐起/造型通过。
