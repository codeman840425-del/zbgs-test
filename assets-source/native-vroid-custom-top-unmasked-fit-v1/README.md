# 843ac完整基体的原生改袖Top单件适配

本包只生成新entry `native-unmasked-843ac-sleeve56-top-v1`。目标是实际完整基体 `843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef`，没有改旧78912清单或把它的房间验收转贴到新身体。没有GPU、Studio、运行时或public修改。

`equipment.json` SHA `9cba67346ad2ed8f7d9af0af5fa941dec273e60330ca8f2616faa533eeab2edb`。资源URL明确引用 `../native-vroid-custom-top-v1/native-vroid-78912-sleeve56-top-v1.glb`，688784 bytes，SHA `75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7`。没有复制或重导GLB，原作者N、UV、图片、MToon及权重字节保持原资源身份。

## 本次实际读回

- 新843ac与原78912的146个accessor分别实际解码全等，nodes/skins/meshes/materials/textures/samplers/extensions也逐值相同。没有只根据旧readback报告推定。新Body使用恢复皮肤PNG的变化不授予上衣覆盖或完整factory准入。
- 本Top真实indices为1226个三角、700个引用顶点，POSITION/NORMAL/UV/JOINTS/WEIGHTS所有原始attribute行及index均与原生direct Top相同。`indexed-skin.json`保实际indices、700个source IDs、各四lane权重/骨索引及完整attribute解码SHA。
- 从新843ac各skin实际IBM重建130条bindings。Top有25个非零影响骨，使用骨IBM精确相同，其26个祖先（含自身）的local/world rest逐项精确对应。原始mesh rest空间相同，不加运行偏移或改绑定矩阵凑合。
- 四个未用Foot/Toe IBM有3.7253e-9至1.1921e-7差异，两ToeBase local Y translation各有约5e-8米差异，均无本Top引用权重。`source-fit.json`和`cpu-verification.json`保源/目标实际值。不称全部130骨rest/IBM字节相同，不改现有1e-5 IBM门。
- 实际官方GLTFLoader/VRMLoaderPlugin和当前createEquipment在843ac加载并commit。rest、raw-arm-bend、raw-thigh-bend各700点finite，对原生direct Top最大world差约13.822、13.822、15.368纳米，原多primitive重复权重normalize与单primitive的舍入区别保持。材质为MToon surface+outline，暂停首帧alphaTest uniform为0.5，UV时间不跳。CPU纹理解码用1px占位，非真实像素渲染。
- 旧78912兼容身份和损坏IBM反例均拒绝。四个生成文件的两次独立计划与实际`--check`重复字节相同。已有输出冲突拒绝，四文件hash不变；记录在receipt。

## 可编辑来源和复现

`input-pins.json`核两份原editable `.vroid`，分别为原女性 `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de` 与原生脱上衣来源 `76955cfa0a2e711af2499e44cbf8682c2231445139a996cf2a549df2dd7d46ac`。它们保持独立原文件，没有合并或另导出。本Top仍沿原生SleeveLong66→56的旧recipe、customitem及direct源链，旧 `source-fit.json` 精确pin保留。

在包含固定输入的新独立检出，且本目录生成文件尚不存在时执行

```powershell
python -B assets-source/native-vroid-custom-top-unmasked-fit-v1/build.py
node assets-source/native-vroid-custom-top-unmasked-fit-v1/verify.mjs
python -B assets-source/native-vroid-custom-top-unmasked-fit-v1/close.py
```

对已封生成文件只读重建检查

```powershell
python -B assets-source/native-vroid-custom-top-unmasked-fit-v1/build.py --check
```

Python/NumPy实际版本和读取器SHA见input-pins，CPU运行源码SHA见cpu-verification；没有安装新依赖，未证明跨平台字节确定性。verify和close回执默认拒绝覆盖。第一准备曾因作者误抄recipe hash而在输入检查阶段拒绝，尚无产物；按原inventory读回纠正，细节保在preparation-note，未更换输入或门。

## 消费与边界

root可消费本单件manifest与new-ID，必要时在正式发布阶段调整相对URL。这里不把它并入原三件生产清单，不注册主profile/controller。使用新entry与843ac的实际body-texture覆盖合同仍需root集成、切换恢复和游戏验证，旧78912录像不可代替。

39点/70面仍属旧透明删除设置的拓扑差异，尚未逐删除面alpha分类，不宣称完整原Top拓扑等价。完整皮肤恢复后衣物遮盖/层间关系、动作与表情、视觉及保存恢复仍未验。仅此25使用骨的单Top适配，无任意衣服/身体通用兼容结论。原source许可证和内部技术样件边界保持，不自行授予商业或外部分发权。
