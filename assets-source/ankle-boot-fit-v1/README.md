# MRT 男踝靴对 1K 制服男体的静态试配

独立样件保留 MargaretToigo 原作的鞋楦、UV 与两侧 22 点靴口，套用目标身体的六个骨骼和逆绑定矩阵。样件在静态裸腿、长裤上都出现交叠，目前只供版型诊断。源件、贴图、作者声明和逐文件 SHA256 均已归档。[作者源件](../../evidence/m2-footwear-author-intake-v1/selected-source.json) · [MakeHuman 原始目录](https://static.makehumancommunity.org/assets/assetpacks/shoes01.html)

| 单侧指标 | 作者 hm08 中性脚 | 目标制服男体 |
|---|---:|---:|
| 鞋底至踝关节 | 88.97 mm | 120.83 mm |
| 踝至前掌关节水平距离 | 121.76 mm | 136.32 mm |
| 前掌处鞋楦外宽（左脚） | 107.28 mm | 101.47 mm |
| 靴筒最高点至踝关节 | 114.60 mm | 139.11 mm |

沿作者小腿、足和前掌权重恢复 hm08 中性版型，先将分米转为米，再分别建立左右踝至前掌的水平轴。纵向按后缘、踝、前掌及鞋头对齐。在高度方向按鞋底、前掌、踝和膝对齐，横向取目标原平底鞋在前掌平面的外宽比。该方法不移动目标身体、长裤和骨骼。样件只使用作者漫反射图的 1K 衍生图；原法线和高光图保存在作者目录。[源坐标及脚姿](../../evidence/m2-footwear-author-intake-v1/cpu-readback.json) · [固定 MPFB 穿衣实现](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/clothesservice.py)

样件含 4,120 个三角形、2,530 个 UV 拆点后的渲染顶点，每点最多三骨。将 GLB 六个目标关节的层级和逆绑定矩阵实际应用在全部顶点上，中性位置最大误差为 1.22 × 10⁻⁸ 米。足底最低点与原鞋相同，位于模型 Y = 0.495 mm。靴顶距膝约 316 mm，裸膝所在水平面与靴体没有交集。[独立 GLB](generated/toigo-cc0-male-ankle-boot-fit-v1.glb) · [几何与裤脚对照](generated/fit-report.json)

从靴口中心在每个真实边界顶点的高度向外投射，左右各有 7/22 点位于小腿表面以内，最大径向差为 14.76 mm；各有 3/22 点越过长裤表面，最大为 0.87 mm。整个靴体和裸身、长裤分别检出 700、316 对相交三角面，原平底鞋对照为 134、14 对。计数受拓扑密度影响，不能用作穿入深度。靴口必须另做该男体的小腿版型。动作中接地、坐姿与衣物表现均待测。[靴口逐侧回读](../../evidence/m2-footwear-author-intake-v1/target-readback.json)

## 从工程根目录复建

使用完整检出的 `F:/gamemake`。本次使用 CPython 3.13.11、NumPy 2.4.2、Pillow 12.1.0 和 Git。已有此 Python 环境时，直接执行第二段。需要隔离依赖时，可运行下列 PowerShell；环境与下载缓存仅放在样件目录。

```powershell
Set-Location F:/gamemake
$pkg = (Resolve-Path 'assets-source/ankle-boot-fit-v1').Path
$env:TEMP = [IO.Directory]::CreateDirectory((Join-Path $pkg '.tmp')).FullName
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $pkg '.pip'
py -3.13 -m venv "$pkg/.venv"
& "$pkg/.venv/Scripts/python.exe" -m pip install --only-binary=:all: numpy==2.4.2 Pillow==12.1.0
```

首次恢复从 MPFB 官方仓库的固定提交 `9de0707fdc88438d7c53a1a2ac7937d9221e2431` 下载四个文件。分别是 `data/3dobjs/base.obj`、`data/rigs/standard/rig.game_engine.json`、`data/rigs/standard/weights.game_engine.json` 和 `services/clothesservice.py`，仓库内共同前缀为 `src/mpfb/`。恢复命令逐个核对原始字节数、SHA256，将四个文件一同放入样件的 `.reference-cache/`。如已有工程的 MPFB 原作者学习环境，构建也能从原安装位置读取相同四份文件。[固定哈希与路径](../../evidence/m2-footwear-author-intake-v1/cpu-readback.json)

```powershell
Set-Location F:/gamemake
$py = if (Test-Path 'assets-source/ankle-boot-fit-v1/.venv/Scripts/python.exe') {
    (Resolve-Path 'assets-source/ankle-boot-fit-v1/.venv/Scripts/python.exe').Path
} else { (Get-Command python).Source }
& $py -X utf8 -B scripts/production/ankleboot_fit/restore_reference.py
& $py -X utf8 -B scripts/production/ankleboot_fit/build.py
& $py -X utf8 -B scripts/production/ankleboot_fit/build.py --check
& $py -X utf8 -B scripts/production/ankleboot_fit/readback.py
& $py -X utf8 -B scripts/production/asset_budget.py check assets-source/ankle-boot-fit-v1/generated/toigo-cc0-male-ankle-boot-fit-v1.glb --class garment --budget-version m2-technical-v1
```

生成命令在输出缺失时写入完整样件；输出存在时重新计算并逐字节比较。第一项回读从打包后的 GLB 检查几何、权重、绑定和表面相交，第二项回读直接应用骨骼层级并寻找两圈真实靴口。两次均可在无 GPU、无 Blender、无网络的环境中运行，前提是上游四个文件已就绪。GLB SHA256 为 `7151301ade15e62870524f670de5b7b5d017e3bbeb60dc93aff2a90167381f53`。
