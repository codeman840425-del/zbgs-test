# 原生 78912 自身装备提取（内部样件）

输入 `assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm`，SHA256 `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3`。仅提取 Body mesh 1 的 Tops primitive 3、Bottoms 短裤 primitive 1、Shoes primitive 2；未换基模、改形、改绑定、改运行时或发布 public。输入及导出中的许可保持内部技术样件边界，原 VRM meta 逐项保在 manifest/extraction.json；没有把默认 onlyAuthor 等许可重标成商业或再分发许可。

## 产物与精确消费入口

- `equipment.json`：`zbgs-equipment-v1`，三个新 ID、相对 GLB URL、bytes/SHA、精确 compatibleAvatarSha256、130 条 sourceBone/targetRawBone/humanoidSemantic/IBM bindings。
- `native-vroid-78912-{top,shorts,shoes}-v1.glb`：每件仅一个原衣物 primitive，原材质及 MToon/纹理图保持；没有转 unlit。
- `extraction.json`：原节点/mesh/primitive/material/accessor/image/texture 到输出映射。
- `../../evidence/native-vroid-equipment-v1/result.json`：真实 Three CPU 读回，原/拆出坐标和骨姿。
- `skin-coordinates.f64` + `skin-coordinates-layout.json`：各姿态/每件全部实际引用点的源XYZ、拆出XYZ，Float64 小端，含原顶点 ID；`statistics.json` 是从这些已存坐标读回的分位误差，不再次求值。

原 POSITION/NORMAL/UV/JOINTS/WEIGHTS/indices/IBM accessor 与 bufferView 内容保持逐字节相同。保留全部原 160 节点的变换/父子关系、130 joint 原顺序；不重映射 JOINTS、不截权或重归一化、不烘焙 bind。每件保原共享 Body 属性 9158 行，但只绘制本 primitive 的 indices：上衣739、短裤1076、鞋600个实际引用点。这个保真方案没有做未引用行/骨清理，不冒认性能优化；没有携带原身体/其他衣物 primitive。

## 实际结果及保留失败

源文件/拆出文件的权重、IBM、作者法线、UV、纹理图片及材质图逐字节或去引用重编号后完全相同，既有 `verifyEquipmentBindings` 通过130条映射。原始/独立装配比较复用 `equipment.js` 的 authoredWorld/authoredBind + 原骨重绑定语义，不附加重复 armature。三姿态为 rest 和既有 `scripts/m1-assets/qa-skirt-equivalence.mjs` 中 walk(step10/119)、sit-rise(step60/119) 的原骨姿公式；**只复用姿态，不调用裙算法/封存舞，不称完整动画或 normalized retarget 通过**。

运行时没有做到逐点完全相等：上衣最大18.7373nm，短裤6.89935nm，鞋0。原先声明的1nm实验精确对照门保留失败。因果已实测：Three GLTFLoader 对每个 primitive 调 `normalizeSkinWeights`，原 Body 5 primitive 共享 Float32 属性，被归一化5次；独立衣物一次。用同一原字节和已装 Three 原方法重放1/5次，分别与实际独立/原内嵌权重逐分量完全相同；共48分量差，最大2.9802322387695312e-8。此为求值路径舍入差，不是导出改权或用户视觉标准；没有为1nm门扫参、改权、重新提取或自动取消准入。

材质实际读取：旧 plain GLTFLoader 读取原 `KHR_materials_unlit` 为 MeshBasicMaterial，不保 MToon；官方已装 `MToonMaterialLoaderPlugin` 则每件一个 SkinnedMesh、两个 material（surface/outline 均 `isMToonMaterial=true`），同 indices 两个 geometry groups。outline 是 shader 位移，**不是额外几何顶点或额外蒙皮网格**；本 CPU 坐标只比较基础网格，不含渲染外扩。首读回把 material 当单个导致测试失败，保 `first-readback-failure.json`；第二次发现上述权重差，保 `second-readback-failure.json`。原 plain-loader 证据不被 root 随后的公共 loader 修复覆盖。

CPU纹理解码替换为1×1 DataTexture，实际图片压缩字节另核完全一致；没有 GPU 编译、同光照观感、服装碰撞、完整动作、fit、profile/recipe恢复或普通机结果。root 的新 MToon loader/update 接入另有证据，本包不宣称该运行时已验。

## 复现与来源

```powershell
# 首次提取（目标输出已存在时拒绝覆盖）
python -B assets-source/native-vroid-equipment-v1/build.py
# 已有产物仅内存重建并逐文件比字节，不写新资产
python -B assets-source/native-vroid-equipment-v1/build.py --check
# CPU读回；已存在 evidence 产物时拒绝覆盖
node assets-source/native-vroid-equipment-v1/verify.mjs
```

提取参考既有 `scripts/m1-variants/build-equipment.py` 的原primitive/IBM/manifest路径，但没有复制其 unlit 转换、权重重写或新衣生成。绑定验证直接复用 `scripts/verify-catalog-bindings.mjs`。CPU使用已安装 Three0.187.0、three-vrm3.5.5（均MIT），保官方源文件及依赖版本hash；不安装新库。官方 MToon 实现见已装 `prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js` 的 `isMToonMaterial` getter、`_generateOutline`，归一化见 `three/examples/jsm/loaders/GLTFLoader.js` 与 `three/src/objects/SkinnedMesh.js`。源许可、SHA和各文件闭合见 package-files.json；后续集成由 root 决定，不覆盖本包失败历史。
