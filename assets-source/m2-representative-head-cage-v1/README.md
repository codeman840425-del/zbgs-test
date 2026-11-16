# 保留 v2 身体分量的局部 head cage 前置试制

当前为 **failed-stop-before-batch**。女性前置通过，男性原 target0 的口内/脸肤 strict pair 门停止。八项新形状批次没有执行，未生成 avatar/衣物派生产物，也没有原八请求的 achieved 结果。`batch.py` 是预备入口，当前 receipt 状态会阻止它运行，其完整导出路径尚未实测。

## 输入与工具

隔离树基线为 `427baa5194b0f19294c33c3fe925366e9982faa6`。spec 保留原八组全部数值，原女 SHA 为 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，原男为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。原 v1/v2、整身 cage 失败包继续作为独立历史。

工具仍为实际安装 Blender 4.5.9 LTS、build `8bf95cbd38d1`、SHA256 `42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024`。Blender 内 Python 3.11.11、NumPy 1.26.4，外部 runner 为 Python 3.13.11、psutil 7.2.2。运行固定两线程，3GiB RSS、600 秒上限。没有安装新工具或执行渲染。

`method-review/` 原字节收录 root 当时的 decision 与 installed-version 官方源码读回。新脚本、cage 规则为本项目原创 CC0-1.0，原人物、服装和贴图仍依其原许可。可编辑 blend 包含原几何，原输入的许可不会因此改变。

## 身体分量的数值复用

`body.py` 显式取原 v2 `Mapper.field()` 的身体段，包括原 only_limbs、原实际骨轴径向核和 taper、hip/waist/chest 混合、support、hand_limit。没有通过将脸参数设零来关闭原脸曲线。

参照函数从固定原 v2 源码 AST 提取到 `s=self.source` 之前的原语句。全部八组请求、原 Body/Face 全数组及全部 morph 端点上的 `P+body_displacement` 与参照逐值误差为零。远端手/指/脚/趾顶点身体位移为零。该证明覆盖源空间数值等价，实际动作和新脸/装备组合仍需后续游戏核验。

| 请求 | body-only 最小 det |
| --- | ---: |
| female-round-full | 0.785833093 |
| female-long-slender | 0.697000074 |
| female-square-athletic | 0.741971009 |
| female-soft-wide | 0.877854544 |
| male-wide-muscular | 0.652180977 |
| male-long-lean | 0.656010135 |
| male-round-stocky | 0.844431743 |
| male-angular-athletic | 0.744553854 |

## 实际局部 modifier 前置门

局部 cage 为 44 顶点的闭合四角环，范围由实际受影响源点和端点计算。空间影响由颈部 C1 过渡、上界过渡、前后界，以及原眼/原髪全端点固定点云的连续距离权重组成。Face_SKIN、FaceMouth 内的口内几何走同一映射，没有把唇单独锁死。原眼/髪固定来自同一空间函数，导数探针和各端点求值都会重算空间权重，没有强制将选中点 J 改成单位矩阵。

源 from_pydata 坐标字节和三角索引一致，mesh 节点无额外变换，米制高度为女 1.597817m、男 1.717148m。全部女 58 / 男 56 个 base/端点数组 identity 最大误差为零，实际受影响点最小 cage 余量为 20mm。

对同一官方 Dynamic MeshDeform 使用全 cage 平移 3mm 的接线探针，女/男加权理论值最大误差分别约 `1.4374e-8m` / `1.4875e-8m`。眼和髪的所有所测端点位移均零，颈界 ±10 微米探针最大位移 `9.3132e-10m`，女/男局部最小 det 为 0.736398 / 0.736650。

这些是 identity 和小探针的前置结果。预备的一次共同实际响应拟合尚未运行，不能把这些前置通过换成女性四个请求已经实现或新脸通过。

## 男性口内 strict pair 阻塞

原 mesh rest 的 FaceMouth/Face_SKIN pair 为 2，3mm probe 后为 0。原 target0 为 `Face.M_F00_000_00_Fcl_ALL_Neutral`，VRM Neutral 组以 mesh1/index0/weight100 绑定。该 authored neutral 与无 morph 的 rest 基础不同。它的源 strict pair 为 22，probe 后为 23，新增 pair 为 FaceMouth triangle47 / Face_SKIN triangle1007。

`generated/pair-diagnosis.json` 保存两三角的原 index、source float64 端点、source float32 端点、解析平移、实际 modifier/float32 端点、各顶点位移/空间权重、每条边 barycentric 与 t、带符号平面距离、交点，以及源和目标全部 strict pair。

六个相关顶点的空间权重均为 1。源 float64、源 float32 与解析一致平移均没有此 strict hit。源相交边点 `u+v=0.9999999944245171`，接近三角边界。实际 modifier Δx 在 `.002999989839736` 至 `.002999993273988m` 间，非一致浮点误差使 `u+v=0.9999995535598971`。实际两个交点为下列坐标，单位米。

```text
[0.0035088393296280477, 1.5357246577322539, -0.09994594461596887]
[0.003508837598610289, 1.5357246575201726, -0.09994594409783651]
```

交段长 `1.8193026337428122e-9m`。该处 float32 x/y/z ULP 分别约 `2.3283e-10` / `1.1921e-7` / `7.4506e-9m`，交段短于 y、z 坐标 ULP。证据应标为 **float-boundary-uncertain**，不能将端点到另一平面的毫米级距离当成穿透深度，也不能把该 pair 静默删除。严格前置门保留失败，是否需要区分 boundary-only 与 resolved-new-intersection 由后续独立数值审查决定。

较宽的 cage x 范围引发了是否误含肩部的核查。原男实际 Body_SKIN 被引用顶点中，`|x-head.x|>.15m` 且 head 空间权重大于零的数量为零。尚未确认真实肩部错误，不能据 shared POSITION 全数组形成的 bbox 断言有实际肩部形变。本轮没有以此修改域、幅度或 precision。

## 当前文件与未执行部分

- `generated/preflight.json` 与 `preflight-run-report.json` 为真实失败回执，保留当时 producer/input SHA。`attempt-1-source/` 是那次生产脚本快照。之后添加的 diagnose 只读源码和结果另由 package inventory 固定。
- `female-editable-head-rest.blend`、`male-editable-head-rest.blend` 保存原几何、原表达 keys、原始局部 cage 与实际 modifier。导出流程按端点重算空间影响，blend 中手动切 key 不替代该烘焙步骤。
- `male-FAILED.blend` 保存停止时的诊断槽状态，包含最后颈界探针输入，不能拿它当男性真实失败脸型预览。原几何仍在 Basis 和原 keys 中，rest 场景另有上述明确文件。
- 八项原请求、共用响应拟合、2mm 实际半宽误差门、全部表达/法线导出、v2 donor 装备与新精确身份路径已在源入口声明，但实际 batch 未运行。实际 requested-vs-achieved、口内表达变化、服装层次和游戏表现均未通过。

唯一共同接入修复预算未用于改形状或放门。此次前置约 11.79 秒，峰值 RSS 248.9MB，没有触发资源上限。后续几次 diagnosis 只重现同一 3mm 探针与读取数据，未搜索参数或生成八组形状。

## 可重复命令

```powershell
python -B scripts/m2-representative-head-cage-v1/run.py --tool-root F:/gamemake --out assets-source/m2-representative-head-cage-v1/recheck
```

该命令预期非零退出并保留男性 strict pair 失败。对该 failed receipt 调用 `--phase batch` 会在 runner 拒绝。所有源输入按 spec SHA 核验，目录已存在时 preflight 拒绝。

```powershell
F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m2-representative-head-cage-v1/diagnose.py
```

诊断入口更新专门的 pair JSON，已有 male rest 场景保留。原 strict 数值门、det>0.12 门、八组原参数及全部原源保持。当前只交付共同身体分量证明、局部实际绑定与明确失败，等待独审决定边界分类。
