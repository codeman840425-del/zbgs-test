# 可独立重建的规则身体数据包

下颌权重 0.625、0.375 两个输入分别生成 9 个文件、13,887,402 字节。从盘根调用独立验包命令，两份实包均与冻结制作规则重算的结果逐字节一致。此制作结果保留静止几何、蒙皮、鞋底和来源核查；签名、整套正式准入和游戏冷开见各自证据。

| 权重 | 包目录 | 外部索引 SHA256 |
| --- | --- | --- |
| 0.625 | `output/m2-first-rule-delivery-v1/data-pack/candidate` | `73aaf1cd01eb36347e04a6ad2f8dbb9258099bf9f1b2179654151cf3141ed9d7` |
| 0.375 | `output/m2-first-rule-delivery-v1/data-pack/control` | `abafdbc04f3374e13f210bc64001c1cea4d80a558d68c69905375357153c8d83` |

索引用相对路径、长度及 SHA256 列出八个载荷。四个根目录 JSON 文件依次承担索引、身体配置、生产配方、CPU 适配回执的职责。其余五项是身体 VRM、装备清单和三件共用原制服 GLB，保留游戏既有的 `/assets/…` 路径。索引的 `recipeSha256` 是规范配方内容摘要，`recipe.sha256` 是 `recipe.json` 的落盘字节摘要。验包先核对调用方给出的外部索引 pin，再用制作端受信模板及已登记**父体**重建所有载荷与索引。候选的工程登记、Vite 构建和 JavaScript 插件都不参与制包。源许可网址随归档元数据保留，模型加载所需的纹理与缓冲区全部内嵌。[候选索引](candidate-index.json) · [对照索引](control-index.json)

在独立 Git 输入库中，仅保留父体登记和必要的模板、端点、原件说明及父体资产。通过正常入口生成两次，调换 JSON 键序仍得到相同索引和载荷。另将适配备注改成已批准、身体 URL 改为外站、各自重算全部包内摘要，验包仍拒绝。测试还核对错体、缺件、多余脚本、不可写发布步骤的清理和重试、盘根输出、源码输出、父目录回退和 Windows 联接。三个实物回归通过。[回归源码](../../../scripts/production/test_shape_data_pack.py)

```powershell
python -B F:/gamemake/scripts/production/shape_data_pack.py build --recipe assets-source/rule-body-recipe-v1/candidate.json --candidate output/m2-first-rule-delivery-v1/producer/candidate/body.vrm --out output/m2-first-rule-delivery-v1/data-pack/candidate
python -B F:/gamemake/scripts/production/shape_data_pack.py verify --pack output/m2-first-rule-delivery-v1/data-pack/candidate --index-sha256 73aaf1cd01eb36347e04a6ad2f8dbb9258099bf9f1b2179654151cf3141ed9d7
python -B F:/gamemake/scripts/production/shape_data_pack.py verify --pack output/m2-first-rule-delivery-v1/data-pack/control --index-sha256 abafdbc04f3374e13f210bc64001c1cea4d80a558d68c69905375357153c8d83
python -B F:/gamemake/scripts/production/test_shape_data_pack.py -v
```

两个入口均可用 `--source-root` 选择另一份受信制作输入树。冻结制作工具仍需模板引用的 Blender 端点、父体配置和已审服装来独立重算。成功时 stdout 返回一行 JSON，含 `indexSha256`、`bodyType` 和 `fileCount`。
