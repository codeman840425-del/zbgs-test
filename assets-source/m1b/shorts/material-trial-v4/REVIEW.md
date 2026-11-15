# 材质试验独立离线复核

实际短裤 GLB 的两件材质声明 `KHR_materials_unlit`，GLTFLoader 对应 `MeshBasicMaterial`；外裤 `MASK/.5/doubleSided`。当前安装 Three **0.187.0** 的 `ShaderLib/meshbasic.glsl.js` 在 `USE_SKINNING` 分支依次执行 morphnormal→skinbase→skinnormal→defaultnormal。原 v4 注入位于 defaultnormal 后，取得的确为已蒙皮、经 normalMatrix 到视空间的法线；反变换 view 后用于世界光向，不是拿静态绑定姿势法线冒充动态。

确认并做了两项有界修复：原双面材质的背面没有按 `gl_FrontFacing` 翻转自定义光照法线；原 settings 数组直接共享给闭包/uniform/userData，外部修改会影响实例和 cache key。现在背面显式翻转，配置复制冻结，每次 clone 有独立 uniform 数组和固定 key。另做有限数字/UV区间检查，使用该版本现存 `transformNormalByInverseViewMatrix`，限定为当前未附加 shader hook 的 MeshBasicMaterial，避免默默丢弃已有 hook 或误用于其他着色器。

`create-cloth-material.before-review.mjs` 保留修改前精确源码，前后 SHA 在 `review-receipt.json`。`output/shorts-diagnosis/392e6f89183d-cloth-v4` 是负责人已用**旧模块**采的同姿势截图，不因此变为修后证据。下一轮应在诊断报告记录新模块 SHA；产品固定构建身份和外部诊断模块身份是两件事。

`node scripts/m1b-assets/qa-cloth-material.mjs` 六组实际离线检查通过：原 map/alphaMap/alphaTest/opacity/透明与裁切属性和纹理字节保留，注入只写 RGB；原材质与全局 ShaderLib/ShaderChunk 不变；settings/两实例隔离；实际 Three Bone/Skeleton 90°姿态下重算法线、相机逆变换与预期一致；不合格配置/材质拒绝；当前资源真实 unlit/MASK/双面声明符合范围。此检查没有 GPU 编译或浏览器运行，不以它替代着色器实际画面。

纹理被材质 clone 只读共享，释放候选只 dispose 材质，不 dispose 仍被原材质拥有的共享纹理。该函数只承诺用于当前 SkinnedMesh：MeshBasic 非蒙皮且无 envmap 的顶点法线分支未启用，不扩称任意 Mesh 兼容。

源 alpha 链保留，不等于布料颜色/细节均保留。现算法使用 UV 高度带和两条固定 UV 竖线保护局部源色，没有语义分割口袋/缝线，不能声称所有缝线都精准留下。固定世界光向也是诊断式 toon 风格，不与场景灯光自动一致。未改任何网格/UV/骨架/权重，不宣称自然视觉、轮廓、坐姿或穿模得到修复。
