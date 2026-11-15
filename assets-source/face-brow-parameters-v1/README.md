# 眉高 / 眉距：单一组合端点源准备

2026-11-15。已实际完成男女各一个代表端点：眉高 +1 mm、每侧向外 +1 mm（总眉距增加 2 mm）。这是真实 FaceBrow 顶点平移，不是表情强度或颜色修改。输出为独立完整模型，不覆盖原源；未改 public/src、未接入游戏、未运行 GPU。**源变形可复现；未放行连续范围、全表情贴面或游戏观感。**

## 实际文件与身份

`spec.json` 锁男女各自原 blend/VRM SHA、Blender 4.5.9、VRM Addon 4.10.5。沿用嘴宽的同一男女原底，不从嘴宽端点继续累加。原出处见 `assets-source/foundation/source.json` 和 `assets-source/foundation-male/source.json`：第三方 VRoid beta 导出，原 `.vroid` 未找回。本轮保留元数据/使用条件，仅修改导出 title 标识候选，不声称新制原创人体。

每个 `generated/{female,male}-brow-height1-spacing1-v1/` 含完整可编辑 `editable.blend`、`avatar.vrm`、从已保存 blend 重新打开导出的字节相同 `repeat-export.vrm`、完整逐点 `mapping.json.gz`、build/audit、全部表情映射。

已补执行一次独立 `fresh-check/`：新 Blender 进程限定2线程，实际分别加载锁定的男女原始 blend，重新执行同一 +1/+1 mm 配方并导出，退出0。`fresh-check.log` 保留加载原源的日志；`fresh-check-result.json` 由独立逐块字节比较脚本生成。男女的 avatar.vrm、repeat-export.vrm、mapping.json.gz 均与 generated 逐字节相同；配方/生成器/源身份、所有形态检查、Body属性与骨架rest审计字段一致，原源SHA仍相同。**两个 editable.blend 原生容器字节并不相同**，分别保留实际SHA；本轮没有定位容器差异原因，不能说整个输出目录或blend本身逐字节一致。导出VRM一致与已记录源几何不变量一致成立，不因此推定未检查的原生容器字段相同。

| 输出 | avatar SHA256 |
|---|---|
| female | `bfdf7f01f02dcf598ee75317282fc32bf7762b1dbc0aefa51396dd3988bd51e5` |
| male | `80abd535c7afef5eee105e1b9bb6cd955351e67aa1b6ce6edb25ed864ac3f2c5` |

## 源结构与两参数方法

男女分别读取 `F00_000_00_FaceBrow_00_FACE` / `M00_000_00_FaceBrow_00_FACE`：各110引用顶点、160三角，全部正权重仅 Head。两侧根据各自 Basis 横向中心和材质拓扑划分，不复制女性索引；每个眉片三角只属于一侧。女生原片每侧横向跨度约62.55 mm、高35.84 mm，男约63.12 mm、高42.92 mm；这些是透明承载片的尺寸，**不是实际可见眉毛的宽高**。

材质是 double-sided / alpha BLEND，1024×256 原眉纹理，含透明区。平移改变承载片及其实际可见纹理在脸上的位置，既不改色也不改 UV；不是将原表情重命名成固定外观。`source-before-after.png` 是已实际查看的 CPU 正投影图，显示整个承载片轮廓，不含透明纹理/灯光，不能当真人眉型或游戏截图。

公式以不变原底求值：`Pnew = Poriginal + browHeightM*heightVector + browHalfSpacingM*spacingVector`。源 Blender 局部 Z 上、X 横向；导出 glTF 是 Y 上。每侧所有眉点做相同平移，Face_SKIN、眼白/虹膜/睫毛/眼线、嘴、头颈、Body、眼骨均不动。选择1 mm作为仅一个有界代表端点，约为片横向跨度1.6%，并用实际皮肤间隙复核；**不是已测安全 ±1 mm 范围**，未扫阈值、未尝试负端点或逐坏点前后修正。

女57个含Basis绝对shape、男55个全部做同一对应顶点平移。由于固定每点仿射 `A_i=I`，`(shape+t)-(Basis+t)=shape-Basis`，因此保留相对表情位移是本操作的正确数学，不是盲用jaw方法。实际导出所有56/54非Basis POSITION delta 最大误差分别3.73e-9 / 7.45e-9 m；全部原表情名、VRM绑定映射、FirstPerson、spring配置原样。Body全部属性、所有node/rest/inverseBind、材质/图片、索引/UV/权重实比不变。端点位置与公式最大误差4.74e-8 m，眉三角边向量误差≤7.46e-9 m，没有缩放、扭曲眉片或动眼骨。

## 皮肤间隙：已测与未定

`source-inspection.json` 保留 Basis 和每一原 authored shape 的270个样点（110顶点+160三角心），沿 glTF Z 投影到实际 Face_SKIN，正数表示眉片在皮肤前方。此为有限采样，不是全三角连续碰撞证明，也没有把多表情同时混合作为全部组合穷举。

| Basis投影间隙 | 女原 → 候选 | 男原 → 候选 |
|---|---|---|
| 全承载片 min–max | 1.543–7.533 → 1.792–9.472 mm | 0.676–5.795 → 1.228–5.813 mm |
| 原纹理 alpha≥0.5 的16个采样点 | 1.891–2.761 → 2.373–3.045 mm | 1.166–2.751 → 1.614–2.840 mm |

所有已配对的样点未新增超过10μm的背入皮肤，亦未新增投影缺失。全承载片在少数原表情本已有投影缺失（女 Angry/Sorrow，男 Angry/Joy/EyeSpread 等），候选仍有部分缺失，不能补写成通过。alpha≥0.5 子样点在所有原shape均有皮肤命中且无背入，候选最大前方间隙女5.108、男5.019 mm；只16点覆盖，不能替代可见轮廓/所有透明过渡像素检查。alpha阈值只用于报告分层，没有改变BLEND材质或渲染。

全承载片最坏间隙变化女1.940、男1.441 mm，说明沿额头曲面横移/上移确会改变离面距离。当前没有把平移自动当“稳定贴面”。下一有意义的判断是同一小端点的有纹理侧/斜面与表情实际回读；若出现明显浮眉，需单独决定额头曲面跟随/法向修正的表示，不能继续盲增平移范围或逐帧补点。本轮不生成该修正。

## 与嘴宽共底的 recipe 接口

`female-brow.recipe.json` / `male-brow.recipe.json` 为离线数据接口，锁原 body SHA、Face position SHA、primitive索引身份、各顶点 height/spacing 向量与独立source映射。只列 `testedCombinedEndpoint`，未伪装已支持 slider 范围。

与现有嘴宽 recipe 的非零顶点交集实际为0；全部原绝对shape上，在原底先嘴后眉/先眉后嘴的最大差女0、男8.67e-19 m。因此可以在共同不可变原数组上组合这两个受限算子。此为位置数学检查，没有另生成组合模型或接入模块。将来不得用当前已修改数组继续累加，也不能 reset 眉时把嘴宽一起还原；必须按原底+完整参数向量统一求值、统一法线/bounds、实例隔离。原body SHA + recipe SHA + 参数共同构成派生几何身份；装备/眼镜/麦克风与视觉接受不能自动继承。

## 重跑

从项目根运行（无渲染）：

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-brow-parameters-v1/build.py -- --out fresh-check
python scripts/face-brow-parameters-v1/source-check.py
python scripts/face-brow-parameters-v1/audit.py
python scripts/face-brow-parameters-v1/plot-source.py
python scripts/face-brow-parameters-v1/check-rebuild.py
python scripts/face-brow-parameters-v1/manifest.py
```

非generated输出从原底重建并比对当前generated的VRM SHA；audit读冻结generated。fresh-check现已存在，生成器会拒绝覆盖；如确需另一次重建应使用新的输出名，并对应调整独立比较入口，不能删旧结果伪造首次执行。实际环境系统Python3.13已有NumPy2.4.2 / SciPy1.18.1 / Pillow / Matplotlib，无新安装。首次检查脚本名inspect遮蔽stdlib，已改source-check；专用pose venv缺SciPy，改用已有系统Python，未改该venv。完整生成执行日志在build.log。没有改public/src、旧嘴宽目录或其他角色/动作资源。
