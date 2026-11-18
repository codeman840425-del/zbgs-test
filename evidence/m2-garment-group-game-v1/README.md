# 一件上衣中的制服与领带

固定游戏 `80fb16b7 / 5859bd00da8b` 首次从独立记录包加载 `grouped-uniform-male`，关闭浏览器上下文后又在全新上下文恢复了同一份签名记录。在两次运行中，胸前深色制服和橙色领带均可见，每次观察的连续 8 个正常渲染帧中两个图元都收到了该场景的实际绘制回调。两者共用唯一的 `top` 装备 ID `source-outfit-release-uniform-top-v1`。[原速游戏录像，4 秒](./independent/grouped-top-1x.webm) · [首次加载](./independent/first.png) · [重新打开](./independent/reopened.png)

| GLB 图元 | 材质 | 顶点 | 索引 | 三角形 |
| --- | --- | ---: | ---: | ---: |
| 0 | M00_001_01_Tops_01_CLOTH | 1,399 | 6,012 | 2,004 |
| 1 | M00_001_01_Accessory_Tie_01_CLOTH | 77 | 276 | 92 |

两个图元在同一个 GLB mesh 内，加载后对应两份已蒙皮的 Three.js 几何。每次检查都把实际装备容器、身体绑定、材质名、顶点数、索引数、可见父链和同帧绘制与 GLB 对照。独立包含 27 个文件，首次与重开都读回完整外观配方。完整固定运行时另在同一角色实例上执行 `pants → pants-top-far → pants`。1K 上衣保留同一套几何和两个材质，切回后原上衣身份与完整配方恢复。独立包只交付原上衣。[逐帧回读](./independent/report.json) · [文件清单](./inventory.json)

制作使用已核工具检出 `27ebb18f` 的批量创建入口，实际产出修订 1，记录签名 `44bbca66f7bbdfc4e19d12500ce94e87c82eec057c3ec697a4cae72fcdd31d2e`。首次尝试时 `54e8a24c` 检出缺少本地 Playwright。两检出的 D02 CLI、浏览器驱动、临时服务器、输出边界及依赖锁文件 Git blob 相同。独立包由 `54e8a24c` 的 registry 和打包器生成，清单 SHA-256 为 `c0165d4135e82370e53bbfb458744cca3e87bd6c20cb892a5164e8716ac05612`。首次浏览器探针对逆绑定矩阵直接使用 JavaScript 数值深比较，遇到 `-0` 与 JSON 保存的 `0`，该次失败回执已留存。正式检查沿用固定源码的记录规范化函数。[矩阵与分组配方](../m2-garment-group-input-v1/README.md) · [D02 结果](./create/report.json) · [签名记录](./records.json) · [首次比较](./first-raw-number-comparison/report.json)

复算时，从工程内干净输出位置用归档批次创建新记录。保留本目录已签的 `records.json` 作为重建本次 27 文件包的输入，新签发的记录带本次创建时间。用固定打包器的 `inventory`、`export` 和 `--source-root` 依次复算并比较清单后，可在没有本次 `independent/` 结果的新接收检出中运行 `node evidence/m2-garment-group-game-v1/verify.cjs`。脚本从本机已核文件提供渲染输入，浏览器关闭后清理临时数据。录像已解码为 120 帧，30 fps，1200 × 602。观察范围为该固定男体和两件登记上衣的游戏加载、待机及换回。预算和正式准入各自保留原判定。[预算回读](./static-budget.json)
