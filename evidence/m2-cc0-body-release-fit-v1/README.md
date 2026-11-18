# CC0 男体的 1K 身体肤色与制服适配

本回执对应 `source-male-cc0-texture-release-v1`。原身体 `cf1118a2…` 与派生身体 `2e66ee6c…` 在 CPU 上逐项比对。155 个未替换的 bufferView 相同，替换区外 11,543,550 个 BIN 字节相同。图 15 是唯一变化的图像，覆盖身体材质的 glTF 基色及 VRM0 的主图和着色图。两张图的全部像素均不透明。

15 个保留图元的索引、位置、法线、UV、权重、原始关节和形变流逐项相等。71 个节点、14 组 VRM 表情及各皮肤的逆绑定矩阵一致。上衣两个版本均有 1,476 个加权顶点和 10 根用骨，裤有 1,095 个和 9 根，鞋有 536 个和 6 根。原鞋底原始顶点最低 Y 为 0.00049472833 米，原地面基准为 0.00049473062 米。每件装备记录保留原 GLB、许可和款式 ID，并登记该身体专用的装备 ID 和 fitId。这里只检查原始静止适配，游戏动作、视觉及设备表现另取实际运行证据。[逐项结果](report.json)

## 重算与接入

在项目根目录运行以下命令。第二个命令只接受已审定的身体 SHA。首次写入前解析输出路径，重复运行会核对已有文件。

```powershell
python -B scripts/production/cc0_body_basecolor_release.py
python -B scripts/production/texture_body_outfit_fit.py
python -B scripts/production/texture_body_outfit_fit.py --check
python -B scripts/production/test_texture_body_outfit_fit.py
```

`output/m2-cc0-body-release-fit-r01/` 含 `body.vrm`、`equipment.json` 和 `profile.json`。将前两项安装到构建输入 `prototype/public/assets/cc0-body-release-v1/`，将后一项中的新角色键并入 `prototype/src/source-outfit-profiles.json`。制服使用原始上衣或 1K 上衣搭配同一长裤、平底鞋，原装备 URL 和身体配置可独立恢复。

六条针对性回归覆盖确切身体、法线图及 UV/形变/索引/逆绑定数据、材质消费者、原始骨架、鞋底/服装槽/GLB 字节和登记矩阵。路径用例实际验证跨检出读入、本机盘根、路径回退及 Windows 目录联接。完整快照中可带 `--input-root` 指定输入工程，用 `--candidate` 指定该 SHA 的身体文件。
