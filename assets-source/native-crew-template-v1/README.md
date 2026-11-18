# 7586 原生男性独立中筒袜

此包提供可编辑服装版型、7586 专用原骨绑定及独立装备候选。原配鞋有可量化的局部袜色外露，鞋袜组合保留候选状态。

| 接入字段 | 值 |
|---|---|
| 款式 | `plain-crew-socks-v1` |
| 装备 / 变体 | `native-7586-template-plain-crew-socks-v1` |
| fit | `native-7586-template-plain-crew-socks-v1-fit` |
| 目标 | `native-male-7586-v1`，SHA256 `7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81` |
| GLB | [修正后的独立袜](corrected/native-7586-template-plain-crew-socks-v1.glb)，85,872 字节，SHA256 `55026b9cb564f86b8f00fc0e1c6868d0e8aa7c44bdb58f4403cedf802ac2f7ab` |
| 装备、适配及配对限制 | [entry.json](corrected/entry.json) · [fit.json](corrected/fit.json) |
| 可编辑网格及目标蒙皮标定 | [editable.obj](editable.obj) · [binding.json](corrected/binding.json) |

## 制作依据

本地已有项目独立制作的 CC0 男款中筒袜。其两只袜子的袜头、足跟、袜口、内外面与口边均已有可重复生成的索引版型。本次直接消费这份服装资产。现有 VRoid 研究记录对身体绘制型袜纹与可导出独立衣物有明确区分，MPFB 衣物需作者制作的对应关系。选择现成的独立袜面后，原生 7586 的脚部皮肤只用作空间和蒙皮标定参考。[模板来源](../m2-socks-layer-v1/provenance.json) · [服装流程研究](../../docs/research/MATURE-GARMENT-AUTHORING-WORKFLOW-2026-11-17.md)

每侧保留 283 个版面顶点和相应内外两层，共 1,132 个蒙皮顶点、2,256 个三角形。两体坐标用脚踝和正面方向对齐，每侧取得 167 对原作身体图集的共同标志点。首次版型对准后，从同侧目标身体三角重心坐标重新计算全部蒙皮。左右脚各使用自身原有小腿、脚和脚趾三根骨，导出的逆绑定矩阵与 7586 原体逐项验证。此过程未对目标皮肤焊接、裁剪或遮罩。

首次导出左、右袜分别与身体产生 432、440 对三角相交。一次修正按原生皮肤在各服装面投影内的实际突出量恢复原有内层空隙。追加余量中位 0.093 mm、最大 1.903 mm。首次结果在 [first-export](first-export/) 保留，运行接入使用 [corrected](corrected/)。

## 适配检查

在原生静止姿势、原骨踝屈 20° 配趾伸 15°、反向踝伸 20° 配趾屈 15° 下，左右独立袜与身体、下装和袜面自身均为零对三角相交。原鞋各侧仍有 253–275 对相交。使用原鞋纹理透明度做 1,100 像素/米的正、背、左、右 CPU 投影，静止时每侧原鞋的 28,137 个像素中有 275 个变为袜色。三姿态最大为 337 / 26,063。该数字反映材质可见性，归入原鞋配对的已知问题。实际动作和游戏启停由集成端另验。[三姿态数据](corrected/pose-readback.json) · [静止材质图](corrected/rest-ids.png)

## 复算与编辑

在仓库根目录运行 `python -B assets-source/native-crew-template-v1/verify.py`。该命令核对来源、重建两次已记录的导出、从独立 OBJ 重导、重算三姿态四视角并逐文件核 SHA。依赖版本与原生研究模型的使用限制保存在 [source-lock.json](source-lock.json)。模板的 CC0 来源及现行原生模型作者、署名与使用条件分别记录，当前派生包仅作内部技术研究。

单独运行 `python -B assets-source/native-crew-template-v1/make.py` 生成修正版 GLB、装备条目、fit、绑定和静态结果。运行 `python -B assets-source/native-crew-template-v1/pattern.py` 可直接读入可编辑 OBJ，逐字节复原同一 GLB。美术修改 OBJ 副本时保留左右对象、点和三角顺序，运行 `python -B assets-source/native-crew-template-v1/pattern.py --pattern 编辑副本.obj --output 新候选.glb`。编辑产生新资源身份，应以新网格重新做配对检查。

## 核对与生成补充装备目录

在仓库根目录运行 `python -B assets-source/native-crew-template-v1/publish.py`。默认核对来源锁、修正版 GLB 的每个字节、目标骨绑定、原鞋与短裤身份、已发布的补充目录和矩阵候选行。可用 `--entry`、`--fit`、`--source-lock` 指定来源，用 `--pairing-catalog` 和 `--pairing-sha256` 指定原装备目录的公共 URL 与哈希。

重新生成时可运行 `python -B assets-source/native-crew-template-v1/publish.py --output experiments/native-crew-publication-check`。输出目录须为新目录，内含装备 GLB、`equipment.json` 和合并后的 `representative-matrix.json`。使用 `--matrix` 可以从尚未含此候选的矩阵补入该行。默认已登记候选的适配范围为原生 7586 男性短裤和原鞋，鞋侧穿出仍列在候选限制中。
