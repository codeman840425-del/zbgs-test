# 同款制服上衣的两体生产计划

同一份 `sharedLook` 用 `uniform-top-v1`、`basecolor-1k-v1` 和 `pants-top-far` 申请两体。调用人只需给每条填身体和角色身份。工作脚本沿现有查询和准入解析精确装备组。输出保留每件装备 ID、slot、SHA256，无需记男女不同的数字索引。 [制作矩阵](F:/gamemake/assets-source/variant-matrix-v1/uniform-top-texture-matrix.json) · [短请求](F:/gamemake/assets-source/variant-matrix-v1/uniform-top-texture-request.json) · [实际计划](plan/plan.json)

| 身体 | 运行配置索引 | 上衣 | 原裤 | 原鞋 |
|---|---:|---|---|---|
| `female` | 5 | `m1-female-uniform-top-1k-v1` | `m1-training-pants` | `m1-uniform-shoes` |
| `source-male-ab9a-release-v1` | 1 | `raw-male-uniform-top-1k-v1` | `source-outfit-release-uniform-pants-v1` | `source-outfit-release-flat-shoes-v1` |

矩阵沿用 v1 格式，选填 `bodyAsset` 时对照 `bodySha256` 读取真实身体，并走生产 `Validator.equipment()` 检查实际装备与身体的原始骨骼、逆绑定和权重。现有 1K 适配工具 `--check` 复算两体精确绑定与女体 252 个覆盖面。D02 普通选择接口验证两件上衣的精确 SHA，实做角色冷恢复时女体激活 1K 专用覆盖，男体沿原绑定保留完整体表。男女均保留套装 0 的精确裤鞋，冷恢复时旧 2048 上衣保持未加载。 [CPU 读回](cpu-readback.json)

两次计划的 JSON 和创建请求逐字节一致。批次中用旧 `male` 本体替代精确派生男体时，女体仍生成一份诊断请求，旧男体得到 `No exact variant`。测试还拒绝拿原 2048 SHA 制作 1K、拿旧覆盖或另一个身体文件替换登记。正式模式实产 `readiness-gated`，0 接受、2 拒绝。游戏运行构建有独立包审查，整套样件仍需其现行 whole-outfit 证据才能正式准入。 [两体生成批次](plan/diagnostic-requests/create-001.batch.json) · [缺少精确体型](missing-body/plan.json) · [正式拒绝](formal-refusal/plan.json)

## 5859 固定身份

既有代表矩阵是浏览器编译和 build digest 的输入，本次另用制作矩阵。主检出 `cc0fa346` 与固定输入逐项检查时，`public/native-production.html` 只有 LF／CRLF 字节差异，已足以拒绝等同声明。计划在 `experiments/worktrees/uniform-top-plan-80fb16b7` 查询公开运行配置，该工作树和原固定源均由 `verify_runtime_source` 全量核对 633 项输入，匹配 5859 的已审查 `build-info.json`。查询脚本与 D02 CPU 助手也核过同提交的字节。未重建 5859。 [身份回执](runtime-source.json)

在项目根目录用已有的计划工作树可复算。输出目录需取本项目内的新路径。

```powershell
$op = 'experiments/worktrees/uniform-top-plan-80fb16b7'
$fixedInfo = 'experiments/worktrees/garment-80fb16b7/prototype/dist/build-info.json'
$proof = 'evidence/m2-uniform-top-variant-batch-v1'
$inputs = 'assets-source/variant-matrix-v1'
python -B -X utf8 "$proof/verify_runtime.py" $op $fixedInfo
python -B -X utf8 scripts/production/variant_batch.py "$op/$inputs/uniform-top-texture-matrix.json" "$op/$inputs/uniform-top-texture-request.json" --root $op --diagnostic --output "$proof/replay"
python -B -X utf8 scripts/production/garment_basecolor_runtime.py --check
python -B -X utf8 -m unittest discover -s scripts/production -p test_uniform_top_variant_batch.py
```

重建计划工作树可用 `python -B scripts/character-worktree.py create uniform-top-plan-80fb16b7 80fb16b7 --runtime-only`，再对该树运行 `git sparse-checkout add scripts assets-source/garment-basecolor-release-v1`。复制本次新矩阵及短请求到该树的同名相对路径。依赖使用已安装的 5859 固定检出的 `prototype/node_modules`，本次通过工作树内 junction 读取。整个回执只覆盖资产、CPU 加载与记录合同，画面、普通电脑性能与正式整套准入仍需各自证据。
