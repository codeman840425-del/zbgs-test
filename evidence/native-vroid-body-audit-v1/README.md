# 新原生男女身体：几何与透明隐藏分开核查

2026-11-17。仅实际源读回；没有修改源/贴图、补几何、构造替身、执行动作或操作 GPU。本包不能作为“完整裸体已通过”或旧男女能力继承。

**结论：重点层位确有身体三角形；上躯干同时存在明确的原贴图透明隐藏。关闭 `delete_transparent` 没有取消这个遮罩。** 腹、髋、膝下的七点/三角抽样未见低于 alpha cutoff，但这不是全表面或视角可见性的证明。衣物是否恰好遮住所有缺口尚未测，不能用衣物有相近高度推断遮挡成功。

| 源 | 女性 | 男性 |
|---|---|---|
| 文件 | `female-native-round-waist-216.vrm` | `male-native-base-216.vrm` |
| SHA256 | `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3` | `a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da` |
| Body node / mesh / primitive | 131 / 1 / 0 | 80 / 1 / 0 |
| Body 实际引用点 / 三角形 | 5,870 / 10,022 | 5,870 / 10,022 |
| 共享 POSITION 行数 | 9,158（不可当身体点数） | 9,158（不可当身体点数） |
| skin joints / 最大非零影响数 | 130 / 4 | 79 / 4 |
| Body 非有限或负权重 / 面积≤1e-14m²三角 | 0 / 0 | 0 / 0 |
| 最大原权重和误差 | 1.28523e-7 | 1.28523e-7 |
| 透明采样世界Y范围 | 1.09299–1.31246m | 1.21786–1.46832m |
| 透明采样世界X范围 | ±0.223821m | ±0.253018m |

两源 Body indices 和 UV 数组逐项相同；几何形体/骨架不同，不能共享源身份或继承验收。各自 primitive/材料/绑定统计均独立读取。上衣/短裤/鞋在两源均为 mesh1 的 primitive3/1/2；它们和 Body 共享属性访问器，不等于身体几何已被衣服取代。

## 实测几何与 alpha

从原 JOINTS/WEIGHTS、IBM 和完整节点父子变换计算作者权重下的 rest 世界位置；没有沿用旧男女尺寸或套 VRM0 翻转。数值使用原 Float32 权重，不替代运行时 Three 重复归一化后的精确纳米级结果。

用实际 humanoid 骨位置定义胸（chest→neck）、腹（hips→chest）、髋（双 upperLeg 平均Y→hips）、膝下（双 foot→lowerLeg 平均Y）四个**测量高度带**；不是解剖分割，胸带也可能包括手臂。各带中点均有真实 Body 三角截线，女/男分别均为110、52、64、48段；具体Y/三角ID/截线数组见各自 result 与 NPZ。由此可以否定“这些截面完全没有Body三角”的说法，不能证明所有表面闭合、无孔或原生导出前后几何完全相同（缺未遮罩原生网格参考）。

Body 材质均为 `N00_000_00_Body_00_SKIN (Instance)`，`alphaMode=MASK`、cutoff=.5、baseColor alpha factor=1，无顶点色；原 baseColor 贴图2048²，578,913像素 alpha0、3,585,921像素255、29,470部分透明。这里统计的是**Body实际引用UV**，没有把整张atlas空白区自动算成身体缺口。

每三角保留顶点、边中点、重心七个样点，共70,154个。初次 nearest 读回保留在 summary；随后仅从已存 UV/XYZ 数组，按实际 LINEAR/REPEAT、identity texture transform、无mipmap采样重新读 alpha，保留为 focus-readback 和 linear-alpha.npz，未重复蒙皮/几何核查。

| 七点采样结果（每源） | 数值 |
|---|---:|
| LINEAR alpha<.5 | 11,118 |
| LINEAR alpha恰为0 | 11,064 |
| 七个样点都低cutoff的三角 | 1,514 |
| 至少一个样点低cutoff的三角 | 1,672 |
| 腹 / 髋 / 膝下测量带低cutoff样点 | 0 / 0 / 0 |

“七点全透明”只描述样点，不声称整个三角已穷尽。透明点包含中央躯干真实位置，例如 Body triangle732 / vertex419，女约 `(0,1.11097,-.03627)m`、男约 `(0,1.23762,-.06774)m`，UV约 `(.2419302,.3024756)`，线性alpha=0。该点有真实三角与蒙皮位置，原材质会按透明阈值隐藏，不能归为“几何不存在”。更多低/高Y边界见证已保存原三角/顶点/bary/UV。

## 交 root 的精确待看项

1. 两性分别固定正/背/左右三分之四视角，先原衣装；再**只隐藏 Tops/Bottoms/Shoes primitive**，保留 Body primitive0 原 MToon/贴图。不能隐藏整个共享 Body mesh节点后得出“身体缺失”。重点看上述上躯干Y带、腋下/肩胸前后是否出现透明缺口，以及腹髋/膝下皮肤连续性。
2. 在单独明确标注的**几何诊断视图**中，仅对同一个原Body primitive临时使用不透明材质，和上一视图同相机对照。若原 alpha 缺口被同一几何填上，支持材质遮罩解释；若不透明仍缺，定位实际三角缺口。这个视图不是新资源、皮肤恢复、成品观感或验收通过，不写回源。
3. 复原原材质与衣装，检查遮罩边缘是否被原上衣完整覆盖；另观察短裤/膝下/鞋边。静态视图不能继承到走坐动作，身体衣物接触还须独立运行证据。

没有官方遮罩生成来源的因果认定：两源相同 UV/alpha 分布支持共享遮罩数据，但本次未操作 Studio 验证它由哪一层/衣物配置生成，不猜“自动脱衣即可恢复”。需要原生修改时先查真实编辑层和保存/导出回读，不直接改PNG透明度凑通过。

## 恢复与证据入口

脚本在 `assets-source/native-vroid-body-audit-v1/{audit.py,focus_readback.py}`，复用 `scripts/m2-male-face-v1/glb.py`；依赖现有 Bridge 内置 Python、NumPy、Pillow，没有安装。一次实际两源审查约1秒；首启动因脚本括号语法错误在读取源之前退出，修复后才执行实际核查，没有重导出或参数试验。

```powershell
& 'F:/gamemake/experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/python/python.exe' -B assets-source/native-vroid-body-audit-v1/audit.py
& 'F:/gamemake/experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/python/python.exe' -B assets-source/native-vroid-body-audit-v1/focus_readback.py
```

固定产物已存在时脚本拒绝覆盖；复核优先读现有 NPZ/JSON。`female-result.json`、`male-result.json` 包含全部实际 primitive；`focus-readback.json` 含透明点精确见证；`summary.json` 含读取器/script SHA及计时。包清单保两份源/代码/产物哈希，不将任何源状态改成已通过。
