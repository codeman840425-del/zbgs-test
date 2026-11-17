# 原生HairSet001独立装备源包

状态为源提取、重复字节、非发泄漏拒绝和同相CPU装配等价通过；旧动态对照失败保留。尚未游戏、视觉、发肤接触或保存恢复准入。没有原生重导出或修改公共运行时。

## 固定输入与三件消费资源

源为 `native-vroid-hairset-study-v1/generated/male-hairset001.vrm`，SHA `dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238`。精确目标为male7586完整皮肤VRM，SHA `7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81`。源原生可编辑 `.vroid`、免费作者预设及许可meta沿已封HairSet001样件保留。MIT three-vrm/Three是解析工具的许可，不能将VRoid内置素材改标CC0或扩大VRM授权。

|资源|SHA256|bytes|
|---|---|---:|
|generated/hair.glb|cfa965e68d4f11ca1a93096edb43f5b7657862f10c40b9d88f5b0fd404ae5a02|1587516|
|generated/fit.json|c4b5f72aca522712256578cc30928ee80453945728e84e50411bed9954b0fb79|27918|
|generated/manifest.json|7e74eebe4d634eae8b2455715899d53e4ba25a677fc0f3de8841a1a4c5766046|1673|

公共URL只预声明 `/assets/native-hairset001-v1/{hair.glb,fit.json}`，本任务没有发布该路径。manifest为新 `character-hairstyle-v2`、style ID `native-male-hairset001-v1`；fit为新 `character-hair-fit-v3`，physics `vrm-spring-native`，fit ID `native-male-hairset001-7586-fit-v1`。旧rigid v1和单材质spring v2合同未改，不能把本包送进旧clone-sourceMaterial路径。

## 实际提取及身份

只保两个实际HAIR primitive。cap为873实际引用点/1632面，新增发束12868点/16600面，全部13741点都被各自indices引用。源共享Body9158行中的非cap行未拷入。两套原MToon材质、7张实际依赖图片及纹理图保持，作者POSITION/NORMAL/UV/WEIGHTS按原sourceId逐值复制，三角次序/绕序由sourceId映射精确保留。

两skin各64条表，构成为59个原生动态发骨和5个cap body骨。实际正权重影响骨union为52，64不能称全部正权骨。JOINTS_0做显式表重编号；表外且权重为0的lane改指Head，并记录数量；所有正权重骨语义、原权重和选中IBM保持。没有重归一化、重新蒙皮或重算作者法线。

最小88节点只含59 hair skin骨、12 hair末端、15外部body-frame代理及2个HAIR mesh节点。仅两个mesh，无Body、Face、服装或隐藏第二完整人物，且没有VRMC_vrm humanoid/表情系统。source cap正权还依赖UpperChest、Neck、Head、双Shoulder，不能假设它只随Head。12原Hair spring使用原Root中心及22个sphere collider、10个group，依赖脊柱、上胸、颈、头、双上臂/前臂/手。仅复制必要祖先与代理，原Tops spring不带入。

两源材质的outlineWidthMode均为none，官方插件实际每mesh只产一个MToon surface，未创建原本不存在的描边。fit.materials中expectedOutlineName表示允许的作者outline命名后缀，不要求生成outline实例。原始glTF材质名含 `(Instance)` 原样保存，不能任意正则模糊匹配。

`generated/extraction.json` 保存原引用顶点、骨表重编号、图像/纹理/节点映射。`dependency.json` 保完整源索引和闭包来源。输出没有复制原身体POSITION行、无未引用顶点、无非发材质。静态QA对额外mesh、Body材质与错误原a18a输入都拒绝；真实新目录重复提取四个文件字节一致。

## 最小运行接口

空间按root决定使用 `avatar-rest-local`，scene以identity挂到目标 `vrm.scene`，不用head/inverseHead反向补偿。不能只刚性挂head，因为cap/body代理和原Root中心都需要实际身体姿态。

```js
loader.register(p => new MToonMaterialLoaderPlugin(p));
loader.register(p => new VRMSpringBoneLoaderPlugin(p));
const gltf = await loader.parseAsync(pinnedBytes, resourceBase);
const manager = gltf.userData.vrmSpringBoneManager;
vrm.scene.add(gltf.scene);
// 验证target/rest、把15个owned代理同步到target raw世界矩阵后
manager.setInitState();
// 每次target vrm.update(dt)之后，再同步代理、完整刷新矩阵、manager.update(dt)一次
```

此示例是接缝说明，运行实现由root/http负责。externalFrames含output node/name、sourceNode、targetRawNode/targetNode、humanoidSemantic、原/目标parent名、restLocal position/quaternion/scale及column-major sourceRestMatrix。目标匹配以原名及确切rest为门，semantic只交叉核，未知/歧义不猜。Root是非human代理，仍对应目标原Root，不换成Head center。

代理均由装备拥有，运行只读目标raw对象，不把目标骨直接借进新skin。同步时把target世界矩阵换算到代理parent-local；手写matrix后须正确dirty/强制刷新，不能留下旧matrixWorld。只同步15个body代理，59 hair骨由官方manager驱动；manager须在挂载和首次同步后初始化，暂停/恢复及卸载遵守独立所有权。每actor独立mutable骨/材质/manager，缓存可保只读字节。本包没有实现新人物控制器或自写spring方程。[官方spring插件](https://github.com/pixiv/three-vrm/tree/v3.5.5/packages/three-vrm-springbone)

## CPU证据与保留失败

`source-QA.json` 与独立审查确认原数组、正权骨语义、64 IBM、两材质/图片和12/22/10 native extension精确。真实GLTFLoader/MToon/VRMSpringBoneLoaderPlugin成功，manager实际59 joints，未形成第二VRM。测试纹理解码为1px fixture，压缩原图字节另核；没有GPU着色验收。

原 `cpu-verification.json` 四静态姿（rest、head+neck、shoulder+arm、root放置）误差约1e-15m；36步官方source full VRM调度与独立递归代理刷新对照最大0.468775558mm，原1e-5m门未过，报告与诊断均保failed。没有改资产、参数或阈值。

face独审唯一因果干预是在完整source的official manager入口先完整刷新world矩阵，保持原solver、source和同步逻辑。新 `cpu-phase-matched.json` 显式referenceSchedulingAdjusted=true，双方同相刷新后同四姿/36步最大2.018347596e-15m。该修正是对照夹具时相，不能把旧默认调度失败换成通过，不能外推运行接缝已过。http运行夹具另曾有代理matrixWorld未dirty问题，属于独立后验，不由本包结果覆盖。

首CPU夹具还曾错误要求每mesh必须surface+outline两材质，源none模式实际只有surface。失败源码快照保留，改为对比原源真实材质实例数/名称，不改变原资源或开启outline。

## 重建与限制

```powershell
# 首次提取；所有输出路径需新建，源SHA固定
python -B scripts/native-vroid-hair-equipment-v1/prepare.py
python -B scripts/native-vroid-hair-equipment-v1/build.py
# 单独重建到新目录，不能覆写既有generated
python -B scripts/native-vroid-hair-equipment-v1/build.py --out assets-source/native-vroid-hair-equipment-v1/rebuild-fresh
# 数组、泄漏/错源和实际重复QA，以及同相官方CPU对照，报告路径均拒绝覆盖
python -B scripts/native-vroid-hair-equipment-v1/qa.py
node scripts/native-vroid-hair-equipment-v1/verify.mjs --matched-phase
```

源码只读取已封输入，不操作Studio/GPU、不提交Git，不改runtime/public。新fit只目标7586，未准入其它身体、脸形、帽/耳/眼镜/配色、动态坐姿、房间碰撞、关闭恢复或普通电脑性能。作者源发型的实际造型/头部接触、源姿态等价与最终可用性分别核验。
