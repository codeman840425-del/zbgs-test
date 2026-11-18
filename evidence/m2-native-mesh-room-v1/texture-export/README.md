# 7586 贴图派生复核

从固定游戏身体 `7586d3bc0921` 和已核对网格前缀 `ca4ab17f4a8a` 生成 `release-body.vrm`，完整 SHA256 为 `b0ce392d0c846edd38d368e1685fc83ac5a4f22f7db65d4088e304b276312a5c`。候选保留全部材质、采样器、贴图与图片索引、骨架、形态、场景及扩展字段。159 个其他 bufferView 和 13,483,354 个其他 BIN 字节经逐字节对照。作者、署名、使用、修改和再分发权限与原始 VRM 一致。完整输入、派生和预算见 [report.json](report.json)。

| 图片 | 源 | 派生 |
| --- | ---: | ---: |
| 脸部法线 | 1024²，15,779 B | 1²，73 B，完整源图均为 RGBA `(128, 128, 255, 255)` |
| VRM 元数据预览 | 2048²，596,463 B | 同一预览图完整画幅，512²，86,178 B |

缩略图由原图用 Pillow LANCZOS 重采样，PNG 重新解码后逐像素等同于重采样结果。元数据继续引用原来的 image 18，其 texture 定义没有任何材质引用。缩略图变小减少文件字节，以及当前静态预算计入该 texture 定义所产生的估算。固定预算、材质引用和使用条件均保留。

| 身体单资产 `m2-technical-v1` | 原始 7586 | 网格前缀 | 贴图派生 | 上限 |
| --- | ---: | ---: | ---: | ---: |
| 文件字节 | 14,194,256 | 14,212,520 | 13,686,516 | 25,165,824 |
| 逐 primitive 顶点数 | 83,462 | 79,806 | 79,806 | 80,000 |
| RGBA8 含完整 mip 静态估算 | 117,791,068 | 117,791,068 | 91,227,148 | 100,663,296 |

身体单资产通过静态预算。原始文件下载内容少 507,740 B，网格前缀再派生时少 526,004 B，HTTP 内容编码未在此次测试。沿既有两记录闭包仅替换身体字节的试算，闭包文件合计从 36,271,845 B 降至 35,764,105 B。双例全部选中贴图静态估算仍为 353,028,776 B，高于 268,435,456 B 临时聚合限。该派生保留原资产和签名记录，需按新 SHA 独立验证记录、装备 fit、覆盖与材质。VRM 元数据含 `onlyAuthor`、`modification: prohibited`、`allowRedistribution: false`，产物用于本地技术实验，实际外发仍需对应权限。未测 WebGL、动作和普通电脑。

## 重建

使用 Python 3.13.11、Pillow 12.1.0、zlib 1.3.1。工程根目录执行。VRM 由脚本按固定文件名生成并被 Git 忽略。

```powershell
python -B scripts/production/native_mesh_budget_prefix.py
python -B scripts/production/native_release_textures.py --write-new
python -B scripts/production/native_release_textures.py --check
```
