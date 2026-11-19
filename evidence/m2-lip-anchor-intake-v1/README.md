# 发布身体的唇缝制作输入

新制作入口按发布 VRM 的 SHA-256、FaceMouth 的网格、图元和材质定位生成 `character-lip-anchor-v1`。它核对 VRM0 `a` 或 VRM1 `aa` 的真实绑定、完整权重及作者的 `Fcl_MTH_A` 目标。32 个索引在图元内编号，与当前运行时选择相同。制作侧的焊接边界若选中同一位置的其他索引，位置、骨骼权重及所有位置 morph 都须一致。

| 身体 | 实际绑定 | 持久描述 |
| --- | --- | --- |
| 1K 女 `1049f87a` | VRM0 `a`，网格 1、图元 0，目标 37 | [uniform-lite-female.json](uniform-lite-female.json) |
| 1K 男 `2e66ee6c` | VRM0 `a`，网格 0、图元 1，目标 28 | [uniform-lite-male.json](uniform-lite-male.json) |
| FaceContour A `825a82c9` | VRM1 `aa`，网格 0、图元 0，目标 39 | [native-contour-roundness-a-v1.json](native-contour-roundness-a-v1.json) |
| FaceContour B `95929335` | VRM1 `aa`，网格 0、图元 0，目标 39 | [native-contour-cheek-b-v1.json](native-contour-cheek-b-v1.json) |

两份 1K 原签身体均用确切 VRM 重建，另存的重放文件与留档逐字节一致。FaceContour 的新描述复用原几何测量，两份既有 `mouth.json` 分别按历史调用逐字节重放。历史 `mouth.py` 和六项发布适配回归保持兼容。

描述存放身体 SHA、源绑定、头和眼骨节点、32 个索引及其排序后 uint32LE 字节的 SHA。参考值是原始头骨局部坐标下的中性、满 A/AA 读数和相邻面法线。此静态输入供运行时回读当前蒙皮后的嘴部。站唱拾音和手麦各自沿用既有验收。

命令允许读取外部归档的精确 VRM，来源记录保留文件名与 SHA。工程内来源记录相对路径。写入统一受制作主工程约束，结果已存在时按字节验证，通过才视为幂等成功。错 SHA、错图元、错权重、错误绑定对象及其他目标均明确拒绝。

在制作主目录中运行以下命令可复验四份留档。针对性套件还会独立生成临时重放文件并对比字节，覆盖盘根、回退路径、Windows 联接、失败后重试及现有不同内容的拒绝。

```powershell
$anchorDir = 'evidence/m2-lip-anchor-intake-v1'
$names = @('uniform-lite-female', 'uniform-lite-male', 'native-contour-roundness-a-v1', 'native-contour-cheek-b-v1')
foreach ($name in $names) {
    $target = Join-Path $anchorDir "$name.json"
    $fit = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json
    python -B scripts/production/lip_anchor.py --source $fit.source.path --body-sha256 $fit.bodySha256 --mesh-index $fit.faceMouth.mesh --primitive-index $fit.faceMouth.primitive --material $fit.faceMouth.material --output $target
    if ($LASTEXITCODE -ne 0) { throw "Lip anchor replay failed for $name" }
}
python -B -m unittest discover -s scripts/production -p test_lip_anchor.py -v
python -B -m unittest discover -s scripts/production -p test_native_release_fit_inputs.py -v
```
