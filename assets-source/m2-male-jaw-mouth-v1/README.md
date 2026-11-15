# 男性jaw派生复用：唯一嘴宽+4%源样件

已从冻结男性jaw真实可编辑源制作一个嘴宽+4%端点，未重新制作jaw。源/全部形态几何、重复导出及从该固定jaw源fresh生成通过。未改runtime/public、旧源或身份门，未进行组合运行/视觉验收。只覆盖原jaw与+4%，没有负向或连续范围准入。

## 身份和产物

| 身份 | SHA-256 |
| --- | --- |
| 固定jaw parent VRM | 25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153 |
| 固定jaw parent editable.blend | 78a08da05ef949e57e7f585fb8a831aa3e00ac1f0cd686a2a15c1a4a69e12242 |
| native raw endpoint | 3367560c43ab7af628eeae5c6b0cd4049ddd67bac5ba6181bf3a495f0cd8d05f |
| final endpoint | 2e72284cc61c027a07a7982ba12965176eca355ffa7aef85f58a87b6916f5447 |
| male-jaw-mouth-width.recipe.json | e953cb663484bbf999064110e21b86c43e73db20cb7de2a49a1138a03a2c51d1 |

parent文件均在 `assets-source/m2-male-face-v1/generated/`；原祖先男性62b44b…记录在spec，不能代替本次parent。沿原jaw VRM的来源/许可metadata，只有title标识新候选，无新增外部素材。`spec.json` 逻辑ID为male-jaw-mouth-width104-v1；实际导出文件夹保留mouth生成器命名 `male-jaw-mouth-width-104-v1`，两者由此明确对应。

`generated/male-jaw-mouth-width-104-v1/` 保存editable.blend、addon-export/addon-repeat-export（native raw）、avatar/repeat-export（final）、mapping、selection、normal-reference、全部表达映射与逐shape报告。`fresh-check/` 从同一冻结jaw editable.blend独立执行同链，未重开本次嘴宽blend冒充fresh。两轮四份raw、四份final分别字节一致；mapping/selection/normal-reference字节一致。两份`.blend`容器字节不同，真实hash分别保留，不声称blend字节一致。

生成器 `build-report.avatarSha256` 沿复用字段名指native raw；最终身份以normal-export-report/final endpoint为准，不能混用。原/新资源以及raw/final均独立保留。

## 派生基底上重新计算

在实际jaw源重新识别Face_SKIN/FaceMouth、32对真实口缝、源polygon边图8 mm衰减和口环中心；不是复制原recipe改SHA。结果480个非零系数、中心与旧原男配方恰相等，`selection.oldRecipeComparison`记录这一实测结果和新源映射。新source坐标中jaw已变化98点；嘴域位置未受jaw影响。

每个绝对shape固定 `x'=center+(x-center)*(1+.04*w)`；相对POSITION delta的X同倍率，Y/Z不变。Source→jaw导出映射检查所有1 µm内同位候选系数一致，保全映射列表。new recipe绑定真实25ac8a parent及其Position/Normal/UV/index/morph hashes，保真实source blend/map身份与独立final SHA。原男recipe不变，不能接受它的parent身份。

jaw98点与mouth位置域交集0，但其三角法线邻域与mouth496点域交集28点，且原jaw在这28点上的authored normal已与祖先不同。此为组合不能复用祖先法线的实际原因。每个绝对shape在**jaw+mouth实际全Face拓扑**上重新求面积加权normal，仅替换mouth三角邻域，外部保jaw作者normal。

native raw仍为POSITION-only morph；final新增每个绝对shape独立计算的NORMAL差分。源可编辑文件重开addon导出仍须执行finalize步骤，不能把raw说成包含final形态法线。已用另一个bincount累加实现独立复算法线。

## 实际离线门

- 410点Basis变化，最大1.115186 mm；新recipe预期位置与独立导出最大误差2.123 nm。
- Basis+54个形态全部：仿射delta误差≤7.645 nm；32口缝最大间隙0；保护域绝对位置精确不变；无新增翻面/退化。边比0.797643–1.109169，不把范围正常直接当自然。
- Body/其他mesh全部attributes、所有index/UV/骨权重、nodes/rest/inverseBind、材质/图像、humanoid/secondaryAnimation及表达preset保持。源meta除title不变。
- final法线独立复算误差≤8.391e-8；域外保jaw authored normal精确不变。
- 同shape原jaw/新几何法线最大变化6.633°（ALL_Joy）。final形态normal相对原jaw静态authored normal最大166.473°（ALL_Neutral），Basis最大46.136°。后者含原本没有morph NORMAL及作者normal差异，不能归结为同等几何翻面，也不能忽略渲染风险；大表情/嘴腔/灯光必须实际查看。

`audit.json`保55形态和具体28交集ID。`fresh-check/rebuild-comparison.json`保真实逐文件hash与一致性。两次入口与复查均核parent源字节未改变。未产生需要调参的离线失败，也未据结果更改幅度/保护区。

## 后续准入边界

recipe schema沿 `character-face-geometry-recipe-v1`，但显式 `supportedValues=[0,.04]`、`range=[0,.04]`。后者仅边界，不表示中间值已验；当前旧validator硬要求±4%且只承认原男女，因此本包不会偷偷获得可用滑块。root/prototype须按固定端点/真实SHA规则显式接入，保未知值/原配方/错误基底拒绝。其余嘴眉鼻眼组合仍不继承。

如果工作台以jaw为底动态应用recipe，人物底层身份仍是25ac8a，另记recipe SHA/endpoint状态；若加载final独立VRM，身份必须为2e7228…并重新声明装备/fit，不可伪装成jaw。后续最小实际回读：同jaw原态/+4%、口型/现有Joy兼容与blink、嘴腔/唇边/颈、reset/双实例/装备保持；本源包未代做该步骤，不重开裙舞。

## 重跑与恢复

工具是现有Blender4.5.9/VRM addon4.10.5、Python3.13.11、NumPy2.4.2及SciPy1.18.1。无新安装、无渲染。新输出目录须不存在，拒绝覆盖现有产物。

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-jaw-mouth-v1/build.py -- --out verify-new
python scripts/m2-male-jaw-mouth-v1/finalize.py --out verify-new
python scripts/m2-male-jaw-mouth-v1/check-rebuild.py --out verify-new
python scripts/m2-male-jaw-mouth-v1/manifest.py --verify
```

现存generated全部几何/recipe复算：`python scripts/m2-male-jaw-mouth-v1/audit.py`；它会确定性重写派生报告/recipe，不改模型，冻结交接后先核新旧字节。`manifest.py`记录作者实际文件字节；局部.gitattributes关闭文本自动换行，保Git归档身份。实际generated/fresh执行日志完整保存，不将源码存在当执行证据。
