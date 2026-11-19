# 原生去上衣重导后的蒙皮回读

同源女性完整 VRM（`78912a7a…01b3`）与去上衣重导件（`188d6e2b…bcec`）保留了 13 个绘制表面、53,654 个三角形。消失的原上衣有 1,296 个三角形。三套 skin 的骨槽分别从 130 个减至 110 个。Body 皮肤实际加权的 56 个关节中有 44 个更换槽号，逐角权重、关节绑定及静止空间仍一致。鞋面使用的 6 个关节全部换槽，裤装 9 个中有 6 个换槽。两个固定输入重复运行产生相同回执。[逐表面数据与输入摘要](control.json)

检查只读取绘制索引引用的顶点，将位置、UV0、法线和该顶点的非零权重一起对应到有朝向的三角形，保留重复三角形的数量。骨槽先解析为真实关节；加权结果同时检查每个实际关节的逆绑定矩阵、VRM 人形骨语义、所属层级、逐级静止变换，以及网格和骨架根节点。重排三角形、顶点、影响顺序或骨槽后仍可重放。继承的原生 VRM1 比较器使用唯一命名的原生资源表；交叉身体自动配准、表情形变、春骨动画结果、材质像素与衣物对身体的覆盖均需其他回读。

在同一去衣 VRM 的内存副本中，将一个已绘制顶点的两个正权重互换、将一个实际加权的髋骨逆绑定平移 20 mm、将 Body 网格节点平移 10 mm，三次分别在权重、逆绑定和节点静止空间被拒。另有眼骨语义互换、祖先循环、非有限法线与合法重排控制。六项测试均通过。[改动值与实际错误](controls.json)

## 复现与接入

从项目根目录运行。

```powershell
python -B scripts/production/native_removal_skin_differential.py evidence/m2-garment-group-input-v1/native-removal-control.json
python -B scripts/production/test_native_removal_skin_differential.py -v
```

生产端可用 `check(spec)` 核对两个文件的 SHA 后取 JSON 回执，或在已核验输入字节时调用 `verify_surviving_skin(source_bytes, reference_bytes, members=None)`。传入原始选择器列表会逐项核对预期移除物；省略时返回实测消失的选择器，供上游与操作回执交叉检查。加权表面、关节绑定或静止空间变化均会抛出 `ValueError`。[程序](../../scripts/production/native_removal_skin_differential.py) · [固定输入](../m2-garment-group-input-v1/native-removal-control.json)
