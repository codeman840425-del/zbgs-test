# 原男女鼻尖突出：地标、单一端点与重建

2026-11-15。**男女各一个 +0.5 mm 鼻尖突出端点已实际生成，源几何与重建检查完成；运行视觉未验。** 从各自原始 blend 生成完整独立编辑源，保存原生addon导出与独立法线整理后的最终VRM。未修改已有 blend/VRM、public/src、运行时或眼骨；仅Blender后台2线程与轻CPU数组检查，没有GPU任务。

## 当前产物与冻结身份

`generated/{female,male}-nose-tip-forward05-v1/` 各含：完整 `editable.blend`；原生 `addon-export.vrm` / `addon-repeat-export.vrm`；最终 `avatar.vrm` / `repeat-export.vrm`；逐点 `mapping.json.gz`；全部绝对形态法线 `normal-reference.npz`；build、normal-export、audit与完整expression-map。

| 文件身份 | 女 SHA256 | 男 SHA256 |
|---|---|---|
| 原生addon导出 | `631ea9bee336363257442c2bc603623ae899b643d373c4ddf5cd41c135078807` | `ff29c32822500090e37511e32b9aec72001420caf9cf52a82f05573a6d20e91c` |
| 最终VRM | `21bb173a02d33e8640a5e933f106ff87d128acc758ed92e52baf7a0ee808e478` | `2ee831257ba2a0c6d74ef29921766db9c4d9b2603b5779cb4c6c9c1a2eeb1fef` |
| 离线/接线recipe | `351c825c39d5a9a056fdd9c783d9ace35b304963c8d06a74e2ccfb3bd3b36da6` | `323d584194c25af47169c1ffd1a20246033bca07e6be7d68ddb8794b25c7a3bc` |

recipe为本目录 `female-nose.recipe.json` / `male-nose.recipe.json`。有明确sourceSpace、sampleId、精确原body/position/normal/UV/index/每primitive身份、所有expressionNames及原POSITION形态hash、固定translationVectors/weights、原blend映射、保护点和法线邻域。只有原态与 `tip-forward05-v1` 两个离散状态，不是±范围或通用鼻型编辑器。

`fresh-check/` 从男女原始blend重新执行同一配方及法线整理；新Blender进程2线程退出0。`fresh-check/rebuild-comparison.json` 独立逐块比较：男女raw、raw重复、final、final重复、mapping与normal-reference均与generated逐字节相同。两次build的源/配方/生成器/形态检查/Body/rest字段一致、原源SHA仍固定。**editable.blend原生容器字节不同**，保留各自SHA；没有定位容器差异，也未声称整个目录或原生blend字节相同。

## 已证地标与源图

`source-landmarks.png` 已实际查看，含男女正面拓扑编号、真实中心线边和斜面几何。所有表面来自各自原始 VRM；橙点只是拟编辑域，不是修改后的模型。无纹理/灯光，不代表游戏外观。矩形范围仅用于展示与辅助寻找地标，**没有用矩形选择编辑点**。

测量锁原男女 VRM SHA 与可编辑 blend SHA（完整值在 `measurements.json`，沿 `assets-source/face-parameters-v1/spec.json` 的同一原底）。Source/blend 坐标转换使用已有 mouth 生成时的原 Basis 位置映射并核对实际位置误差；每个地标同时记录导出顶点号、原 blend 顶点号及两种坐标，女性与男性分别识别，没有复制女性索引。

| 源语义 | 女导出 / blend点号 | 男导出 / blend点号 |
|---|---|---|
| T：鼻尖，中央鼻区最向前点 | 1619 / 1618 | 1050 / 1050 |
| U：鼻尖上邻点 | 1620 / 1619 | 1051 / 1051 |
| B1：下鼻梁 | 1612 / 1611 | 1044 / 1044 |
| B2：中鼻梁 | 1605 / 1604 | 1064 / 1064 |
| R：上鼻梁参考 | 1509 / 1508 | 1071 / 1071 |
| Aneg / Apos：两侧鼻翼/侧壁参考 | 1608 / 1607；1623 / 1622 | 1039 / 1039；1055 / 1055 |
| S：鼻底参考 | 1616 / 1615 | 1042 / 1042 |
| P：人中上部参考 | 1636 / 1635 | 1059 / 1059 |

T的极值通过原顶点表独立核对，并在侧面真实边链可见。Aneg/Apos是风格化表面的人工语义参考，不是自动人脸识别结果；原模型没有由此证明的真实鼻孔/鼻翼解剖分割，不能据这些点扩成鼻孔或鼻翼独立参数。

女Face_SKIN 780引用顶点/1350三角，男784/1360。当前图基于原始顶点拓扑，未做诊断焊接；原skin含UV/材质分裂形成多个开边组件，不把其全部称作几何漏洞。两个24点眼开边与32点口缘可独立识别；此外**所有**原开边均纳入保护，避免分类失误放行。按0.1 mm匹配Body的Face/Body重合点女44、男50亦单独保护；这只是当前导出坐标匹配计数，不等同声称完整颈缝解剖只有这些点。

## 唯一建议端点及有限理由

参数 `noseTipProtrusionM=+0.0005`。原 Face_SKIN 边图从各自T点按真实边长计算最短路径距离d；d≤2 mm权重1，2–8 mm按smoothstep衰减，d≥8 mm为0。导出glTF沿-Z向前（Blender局部+Y）。只准备正向一个端点，无负端点、连续范围或鼻高/鼻宽附加任务。

8 mm的边界来自实测可保护范围：T至B1最短路径女8.917、男8.740 mm，至侧壁参考女8.989、男10.209 mm；鼻底女11.787、男17.851 mm。因此8 mm域在两具源上均不触及已标B1/B2/R/A/S/P，而不必按大矩形把颧/眼/唇一起移动。女仅9个非零权重点（关联24三角），男7点（20三角），全部仅Head权重。T至任一原skin开边最近路径女32.708、男39.655 mm。

0.5 mm是本轮唯一小端点幅度：对原T相对两侧壁的前突差，约为女7.40 mm的6.8%、男8.80 mm的5.7%，并非由此推导的安全范围。固定幅度执行，没有扫描毫米数。`measurements.json` 保留生成前的原点、邻居、距离、权重和受影响三角，其“proposal”状态描述原测量阶段；`spec.json`锁该测量SHA，实际生成/审计结果另存，不回写测量成事后成功标签。

## 表情、法线、共同原底

已读全女56、男54个非Basis POSITION形态。在拟域内，女仅ALL_Surprised/MTH_Surprised存在超过1μm的原位移，最大0.059402 mm；男所有形态在该域位移为0。原受影响三角在所有已读形态的最小双面积女2.243e-6、男4.009e-6 m²。现已检查Basis及全部修改后的绝对形态：仅女9/男7点改变，位置公式误差≤6.57e-9 m，实际导出的相对POSITION delta与原全数组相同；其余Face位置、眼口开边/头颈/嘴眉以及Body全部属性保留，nodes/rest/inverseBind、UV/索引/权重、材质/图片/表情绑定实比一致。

所有绝对形态均无新增退化或翻面。全Face边比女约1.000000–1.061720、男0.998736–1.062171；面积比女1–1.068500、男1–1.070596；三角面法线变化最大女3.2834°、男2.4258°。这是源数组质量检查，不是可见轮廓或观感接受。

每个绝对shape与Basis实际使用同一固定逐点平移：`A_i=I`，`shapeNew=shapeOld+t_i`，所以相对POSITION delta数学上不变。原shape名字、表情绑定、骨/眼轴心保留。相邻点t_i不同，不能把“相对位置delta不变”误说成法线也不变。

**原导出与最终导出的重要区别：**原男女及本轮native addon导出均只有POSITION形态。addon已重算Basis的局部法线（女17/男15点变化），但没有输出形态NORMAL，不能称全部表情法线已经正确导出。`finalize-normals.py` 因而是生成合同必需步骤：对完整Face三角，分别计算Basis及每一实际绝对shape的面积加权法线，仅将鼻部受影响三角的顶点邻域（女17、男15）替换，其他点保原作者法线和原先无morph-normal的语义；最终增加 `NORMAL = absoluteShapeNormal - newBasisNormal`。不是将一份Basis法线套到全部shape。

`audit.py` 用另一种bincount累加实现独立复算最终VRM，全部绝对法线最大向量误差≤3.87e-8，最大长度误差≤1.12e-7，邻域外逐值原样。另保留每形态完整normal-reference供后续runtime对照。法线估计方法本身有可见风险：几何变形的面积加权点法线变化最大女2.483°/男2.926°，但最终相对原作者法线（含所有形态）最大差女13.408°/男12.756°；最终Basis相对native raw Basis法线差最大8.901°/6.495°。这不是全由0.5 mm位移引起，必须在实际光照下检查局部明暗，不能因为无翻面就当观感通过。runtime尚未在本目录执行；prototype获交相同法线规则作独立比较。

已有嘴宽非零mask与本域交集实际为0；眉在独立FaceBrow区域，亦不在新法线邻域内。可沿同一锁定原底维护参数向量，避免从当前变形结果累加或reset鼻时抹掉嘴/眉。新recipe已补primitiveIndex、UV/位置/索引/normal身份与形态语义；仍不是修改已有runtime schema即已完成的声明。多个算子同时激活时，法线应在完整共同几何上按影响邻域并集重算，而非相互覆盖。

## 眼镜与未测边界

当前 `live-presentation.js` 的镜框初始前后定位读取虹膜及眼高±20 mm的Face前表面。拟域最高点仍在此带下方：女13.513 mm、男19.049 mm，因此这一个鼻尖局部域不改变该定位带；上鼻梁地标也为0权重。这只是代码与位置关系，不是眼镜接触通过。已有 `assets-source/acc01-temple-fit-v1` 是原男女精确SHA的镜腿修复，未替此新鼻型重验鼻桥/下镜框；新导出身份不自动继承眼镜适配，真实有纹理侧/斜面与佩戴过程仍需回读。

还未测：可见轮廓/明暗、纹理观感、多表情同时混合、实际眼镜最近距离/接触及游戏。本目录完成源制作与离线验证，不能宣称鼻部运行参数已支持或全脸可编辑完成。

完整复算（系统现有Python、NumPy/SciPy/Matplotlib，无新安装；固定Blender4.5.9/VRMAddon4.10.5）：

```powershell
python scripts/face-nose-parameters-v1/measure.py
python scripts/face-nose-parameters-v1/plot-landmarks.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-nose-parameters-v1/build.py -- --out replay-check
python scripts/face-nose-parameters-v1/finalize-normals.py --out replay-check
python scripts/face-nose-parameters-v1/check-rebuild.py --out replay-check
python scripts/face-nose-parameters-v1/audit.py
python scripts/face-nose-parameters-v1/manifest.py
```

沿原素材出处/使用条件：`assets-source/foundation/source.json`、`assets-source/foundation-male/source.json`。原blend为已归档VRM重建的编辑源，不是假称找回原 `.vroid`。

生成与最终整理均拒绝覆盖现有输出。generated/fresh-check已保留，示例另用新的replay-check；再次执行需换新的输出名，不删旧证据。audit对冻结generated做独立解码验证。所有最终VRM依赖完整导出链；直接从editable.blend点一次原生导出只得到raw语义，不能冒称是已带完整NORMAL形态的final。`manifest.json`记录实际作者字节的源/脚本/recipe/产物SHA。
