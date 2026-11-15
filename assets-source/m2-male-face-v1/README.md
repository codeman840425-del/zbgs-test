# M2 男性下颌离散源样件 v1

一个实际男性脸型几何派生，ID `m2-male-jaw-v1`，不是表情预设、女体缩放或参数库。原男性/女性全部资产保持。源码与导出只位于本目录及 `scripts/m2-male-face-v1`，没有修改共享 runtime/public。

## 现有成果与本次新增

既有 `docs/MALE-VARIANT-MECHANISM-REUSE.md` 仅核制作机制，明确未产男派生；没有重复造已有样件。复用原Blender4.5.9/VRM Addon4.10.5的保存源→编辑Basis→同delta加入全部shape→重开导出机制。独立测量男性坐标与保护域，没用女性jaw绝对高度：男脸最低Z1.49618m，眼线最低1.58111m，口腔材质Z1.52864–1.55576m。

只改变Face皮肤下颌/下巴：有限增宽、略前移/延长。`spec.json`定义男性中心/前侧/高度平滑场、口周保护、颈接缝匹配。原50个脸—Body近重合点及其一圈共116点保护；眼、眉、睫毛、口腔、Body与头发都不改。所有54非Basis shape同一顶点delta，因此保原表达相对差；不是将它们重置为中性脸。

## 实际结果

- 新VRM SHA256：`25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153`，17,902,652 bytes。
- 实际98点改变，最大2.30588mm。Face拓扑/UV/权重、全部骨rest/逆绑定/节点、纹理/材质、原许可metadata（除新title）不变。
- Body、上衣、领带、长裤、鞋、头发、眼眉与口腔位置变化0；导出Body全部attributes与index逐值/字节相同。
- 54表达POSITION差相对原最大7.45e−9m；14个原VRM表达组bind映射不变。源55keys含Basis，导出54targets，不混淆。
- 脸皮肤边长比0.96330–1.22721，最大三角法向变化8.5746°，未新增翻面或退化。此为几何数据，非脸型/闭眼/张嘴自然度验收。
- 实际独立从原blend生成两次；每次保存、重开、导出两次。四份VRM SHA完全一致。两份.blend封装hash可以不同（Blender文件封装），不冒充二进制一致；规范产物VRM实际一致。

`generated/editable.blend`为可编辑源，`source-delta.json.gz`存2056点原坐标/位移与98点集合；`inspection.json`记录实际男材质/shape/边界。`expression-map.json`明确原preset→mesh/targetIndex/targetName/weight，不按女性索引假设。

## 来源与工具

父源：`assets-source/foundation-male/base-male-candidate-editable.blend` SHA c076d81ce83baad19c356053d9dba5af47ec8f88476d9153e8e0922ae7662751；父运行资源62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff。原始VRM和父源未覆盖。它是既有VRM重建blend，不是找回原.vroid。

沿用 `assets-source/foundation-male/LICENSE.md` 与 `source.json` 保存的旧beta Base_Male来源/条件：hecko发布、VRoid Project归属，旧beta CC0依据与第三方导出局限不变；不将此条件扩展到当代新素材。没有另添外部素材/新许可。

## 重放/恢复

在仓库根，工具使用现有固定目录，2线程。新输出必须不含avatar.vrm；脚本拒绝覆盖，失败不会修改原源或现候选。

```powershell
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-face-v1/source-inspection.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-face-v1/build.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-face-v1/build.py -- --rebuild
python scripts/m2-male-face-v1/audit.py
python scripts/m2-male-face-v1/build-fit.py
node scripts/m2-male-face-v1/check-fit.mjs
```

前两次源生成已执行、输出保留。新检出再次核身份可用最后参数 `-- --rebuild --out verify-new`，必须是本源包下尚未存在avatar的子目录；它重新读取原blend并与generated的VRM SHA比对，不重开上次派生叠加。`generated/executed-build.py`保留首次实际执行代码；当前build.py仅增加有界自定义新输出目录，几何计算不变。`build.log`/`rebuild.log`有真实执行记录。

一次QA脚本命名inspect.py曾遮蔽Python标准库inspect导致numpy导入失败，已改source-inspection.py；与资源或模型无关，最终audit实际通过。

## 最小游戏适配数据（未改共享配置）

`generated/profile-entry.json`供root在隔离候选注册 `FOUNDATION_PROFILES["m2-male-jaw-v1"]`，referenceBody='male'。复制映射：

|本包文件|候选服务URL|
|---|---|
|generated/avatar.vrm|/assets/m2-male-face-v1/avatar.vrm|
|generated/equipment.json|/assets/m1b/m2-male-jaw-v1-equipment.json|
|generated/forearm-profile.json|/assets/m2-male-face-v1/forearm-profile.json|

装备清单放m1b目录是为了保原相对资源URL真实解析；不能随意移至m2目录而引发404。四件原装备id、styleId（原短裤拥有）、URL、资源hash、原绑定、UV/材质全保留。仅新增/改专属fitId与精确兼容新avatarSHA，并附不变Body/逆绑定实证。没有伪造原body身份或复制女装备。`fit-receipt.json`逐项记父fit/新fit、资源和依据。

原forearm所有测量profile数据原样，先实核Body全部属性/index/逆绑定一致，再将其新专属bundle身份绑定25ac8a…；实际validator接收新SHA、拒绝父SHA，见fit-data-check.json。座厚0.0036及短裤对应值沿用原男的相同Body/装备几何，明确为待本样件游戏回读，不继承旧验收。

**未自动继承**麦克风、眼镜、normalized SHA专属舞与原短裤可选材质recipe。recipe锁原body/fit，本清单不提供该可选入口（原pins完整保存在receipt）；原GLB材质仍原样。Root应保留未知fit拒绝，而非替换所有hash。

## 下一实际回读范围

仅此新ID并排父男：中性脸/侧脸、眨眼/左右blink、a/i/u/e/o、joy/fun、嘴牙/唇边/颈缝；长裤/短裤实际装卸、站走坐起与足椅接触，及双实例独立。脸型与表情视觉、实际pose接触、普通设备性能尚未测。没有扩体型参数、没有重优化已封存舞或裙。
