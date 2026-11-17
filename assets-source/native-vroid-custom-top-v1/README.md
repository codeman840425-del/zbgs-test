# 原生改袖独立上衣技术样件

本包仅输出一件Top，目标为原78912女性VRM。没有复制裤鞋、修改原source或控制器，没有新编辑器、GPU、VRM重导出或正式菜单接入。

| 身份 | SHA256 |
| --- | --- |
| 目标原VRM，透明面保留 | `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3` |
| 同source baseline，透明面删除 | `88a34746c9563112e7c75231345c1a9efba14b9628720b1c281aecbd91ab224a` |
| 原生SleeveLong66→56 direct/reused VRM | `6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634` |
| 本包单件GLB，688784字节 | `75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7` |

## 单件适配依据

`source-fit.json` 保存全部700个baseline Top引用顶点到原78912 Top739点的唯一对应。对应使用原始POSITION、作者N、UV、JOINTS和WEIGHTS的完整精确字节签名，不用最近点、任意空间阈值或全body白名单。1226个保留有向三角全部属于原1296个三角，剩39点/70三角与两种透明删除设置的拓扑差异分开记录。没有独立逐三角证明被删除部分的纹理alpha，不据此宣称完整原服装拓扑等价。

原生direct相对baseline仅改袖参数。提取保留direct的原始POSITION/N、UV、权重、索引和MToon图像/采样器图，后者与目标原Top按嵌入图片实际SHA及sampler归一化后完全相同。没有转换unlit或重算法线。

两个来源的130骨名称、顺序及humanoid语义相同，但全骨rest/IBM并非逐字节等同。实际Top非零权重仅25骨，这25骨IBM及全部祖先node的局部变换完全相同。差异只在不影响该Top的Foot/Toe，其中IBM最大差1.1920928955078125e-7，低于现有装备加载器原先的1e-5检查。两个ToeBase的translation也有小差异。没有为此改变已有loader阈值，也未将unused差异说成全骨精确相同。

Body实际引用域为原5870点、baseline5103点，使用精确UV/JOINTS/WEIGHTS映射。16个重复签名只能证明坐标等价，未声称唯一原vertex ID。460点有位置字节差异，最大约0.125微米，全部位于y0.0147..0.2763米，低于本Top最低引用y0.79359米。以上没有近邻拟合或删除body，不能将这份单Top证据扩成全Body兼容批准。

## 可重复制作和CPU加载

```powershell
assets-source/vroid-expression-study-v1/private-tools/.venv/Scripts/python.exe assets-source/native-vroid-custom-top-v1/build.py --check
```

`build.py` 在证据检查完成后，直接import未改的既有 `native-vroid-equipment-v1/build.py`，仅显式替换其source/SHA输入。原函数在内存产生三角色结果，本包只取Top，裤鞋结果被丢弃，没有写出或复制。GLB仍由该既有保bufferViews、原skin/IBM、作者N/UV和MToon图像的提取实现生成。本包新建首次执行须无既有输出，默认拒绝覆盖；`--check` 实际重建五产物且字节完全相同。

```powershell
node assets-source/native-vroid-custom-top-v1/verify.mjs
```

实际官方GLTFLoader/VRMLoaderPlugin与现有createEquipment已将本件加载到原78912骨架并commit，得到MToon表面+outline两个材质。引用的700点在rest、原raw手臂弯曲、原raw大腿弯曲夹具均finite，对direct原Top的最大世界坐标差约13.8、13.8、15.4纳米，原多primitive共享权重重复normalize与单primitive加载一次normalize的差异保留。没有改原权重来凑零。

该CPU加载用1px贴图占位代替图像解码，原PNG实际字节由source图检查单独保证。没有渲染、normalized动作、原生spring轨迹或可见性/coverage试验。CPU报告为 `cpu-verification.json`，新manifest在 `equipment.json`，真实GLB为 `native-vroid-78912-sleeve56-top-v1.glb`。verify默认拒绝覆盖既有回执。

## 来源与未验项

源自内部原生制作样件311a，唯一参数、customitem保存/重用记录引用前包封存数据。源`.vroid`、两个历史VRM和前包37项清单保持。工具实现沿原作者MIT及其notice，模型/素材与下游VRM许可独立。本包保留source meta的onlyAuthor/personalNonProfit等限制，没有改变许可或宣称外部分发授权。

单件目前为source-backed technical candidate，未进正式菜单。原Top隐藏、新Top可见性、上下装组合/coverage、同房间原材质与改袖轮廓、走坐起及完整动作均待root固定候选验证。不能把本包当完整基体升级、任意衣服自动适配或跨性别准入。
