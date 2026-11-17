# 男性7586自身三衣CPU包

新身份为 `native-unmasked-7586-{top,shorts,shoes}-v1`。目标为 `native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm`，SHA `7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81`。本包只有source/fit/loader CPU证据，未进入factory、公开目录或游戏视觉验收。

|件|SHA256|bytes|引用点/三角面|
|---|---|---:|---:|
|Top|9276dd1dd88f1ac8ebdab228441eeaf50a3148d8a448d43dcb5c1a369385f4ae|763240|739/1296|
|Shorts|1766826c44a0a8530caee223f29559c4ef5e462e372907db2e1b353a35252e71|942240|1076/1624|
|Shoes|e10770630ad50646c995b0b125af1ac3187649d60107b691f20a6e9dc92cca5f|667976|600/712|

`generated/equipment.json` 为现有 `zbgs-equipment-v1`，SHA `e412188206670c9bf84b7f2019aab8a60778a2d0f6ac29df9d92091fd18d80a8`。每件含重新读取目标7586的79条绑定、目标身份、source许可及原资源SHA，离线URL与GLB同目录。没有复制女性130骨。

## 来源和生成

使用原a18a男性衣物与已封male-preflight的实际node80/mesh1/skin1、Tops primitive3、Bottoms1、Shoes2。新7586的全部nodes/skins/mesh/材质和解码accessor先与原a18a核全等。提取复用女native-equipment的原primitive/bufferView/材质图重编号方法，源选择和绑定均按男性数据重建；没有改原脚本或生成新款式。

每件保原91节点和79-joint顺序、父级/local rest、IBM、原共享9158行POSITION/NORMAL/UV/JOINTS/WEIGHTS，只draw选中primitive的indices。未压缩未引用行或清理未用骨，文件成本如实列出。原完整79骨avatar继续拥有Tops辅助骨及spring，衣物GLB保其装配节点但没有复制VRMC spring manager，避免重复模拟。当前只支持这套原生已有骨的衣物。

独立 `verify_source.py` 不导入builder，从原a18a及实际GLB重新读取，核每attribute/indices/IBM字节、全部节点与父级、材质重编号还原、图片原字节和采样器。绑定来源及正权重骨表保在 `generated/extraction.json`，实际使用骨Top25/Shorts9/Shoes6。原源、双编辑源和皮肤来源通过目标基体manifest继续可追溯。

## 真实adapter CPU结果

`verify.mjs` 使用当前实际 `createEquipment`、官方 GLTFLoader/VRMLoaderPlugin 和 MToon loader，加载并 `equipSet` 三件。每件单SkinnedMesh、surface+outline两MToon材质，加载完成且尚不可见时alphaTest uniform已为.5、UV动画偏移0，后续dispose幂等。原/独立在相同raw骨rest、arm bend和thigh bend三姿对照，全部2415引用点每姿均finite。

- Top最大20.9649nm。
- Shorts最大7.68123nm。
- Shoes为0。

对照门为既有loader量级1e-5m，原始误差保留，未改文件权重或把误差记成0。原多primitive共享属性可能被GLTFLoader重复归一化，单件一次，这一已知路径舍入边界继续适用。当前测试没有通过重新归一化消除差值。每姿全部坐标保在 evidence `coordinates.f64` 和layout，便于独立重算。

三件均实际拒绝原a18a avatar身份；现有binding verifier拒绝各件错误IBM、缺失目标骨、重复source binding。纹理解码使用1px CPU fixture，压缩图原字节另核；没有GPU编译、实际图片着色、normalized动作或spring步进、完整行走/坐起/接触。

## 鞋底及覆盖输入

`generated/floor-measurement.json` 的 `sourceFloorY=-1.1503509525979781e-6` 米，来自600个实际Shoes引用点的rest skin world最低值，记录顶点6988/7070、相邻面和坐标。未用共享accessor其他衣物行估计，不代表动态足底接触或滑步通过。

配套 `assets-source/native-vroid-male-body-texture-fit-v1/generated` 包含原a18a Body MASK PNG、原生完整PNG的SHA关系及三衣有限规则。仅批准本Top存在时使用原生遮罩，脱Top时回完整原生PNG；两图全4194304 RGB texel相同，无画皮肤、三角删除或扩大遮罩。

当前公共 `prototype/src/body-texture-coverage.js` 仍硬限定女性843ac、女图片SHA和4条装备规则。此男三衣覆盖数据尚不能直接通过该运行模块，后续需root做明确男性source准入及事务验证，本包未改公共代码。覆盖数据不授予任意衣物fit。

## 复现和封包

```powershell
# 目标generated尚不存在时首次制作；两个builder均拒绝覆盖
python -B assets-source/native-vroid-male-equipment-v1/build.py
python -B assets-source/native-vroid-male-body-texture-fit-v1/build.py
# 只读原/提取比较和真实CPU adapter，证据目标也必须全新
python -B assets-source/native-vroid-male-equipment-v1/verify_source.py
node assets-source/native-vroid-male-equipment-v1/verify.mjs
node assets-source/native-vroid-male-equipment-v1/qa-bindings.mjs
```

实际 `qa.py` 在evidence新目录完成两包重建，全部6+3文件字节相同，原产物重跑拒绝且SHA不变。保留错误覆盖producer首版快照。首版把base显式texCoord0与shade省略默认0当成不等，写前失败；修为glTF默认语义比较，方法同女性producer，未改数据、阈值或材质。此后生成通过。

本机依赖现有Python/NumPy/Pillow与Three0.187.0/three-vrm3.5.5，无新安装；跨平台字节确定性未证。所有输入与输出SHA在closure/package-files，public/runtime/Studio/GPU/Git均未操作。源meta维持内部样件限制，不宣称商业/分发授权。
