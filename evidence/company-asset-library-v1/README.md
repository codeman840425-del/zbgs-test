# 标准GLB资源库

实现文件为prototype/src/company/asset-library.js。调用createCompanyAssetLibrary({fetchImpl})创建独立库，先await library.preload(实际使用的资源数组)，再同步library.instantiate(resource)取得{root,nodes}。nodes按实际加载后的Object3D名称索引。调用方负责把root安装到场景，并沿现有render.disposeTree释放实例资源。library.dispose清缓存和加载中的候选，可重复调用。

preload跳过没有asset字段的程序资源。asset必须声明format=glb、url、sha256和bytes，资源必须有稳定id/version及metres/+Y/+Z坐标声明。同一完整内容身份的并发加载共享pending，失败可以重试。实例复制geometry、material、Texture和TextureSource，实例释放或修改不影响其它实例与缓存。typed pixel数组同步复制，浏览器已解码图像像素作为只读内容共享。

仅支持GLB BIN及bufferView图片。URI形式的buffer/images、骨骼、动画和当前未配置解码器的Draco/meshopt/Basis压缩被拒绝。局部/世界矩阵及位置数据必须有限，默认场景必须含非空mesh。声明的seatNodeId/backNodeId必须唯一解析为实际mesh。必需图片/纹理加载失败返回asset-texture-load-failed，缺少对应UV返回missing-asset-uv。blocking资源的默认scene世界XZ包围盒须被声明footprint覆盖，容差1mm，否则返回asset-footprint-mismatch。错误为带code/path的CompanyError。

库不创建renderer、动画时钟或角色。实例只能在对应精确资源preload完成后取得，已dispose的库不会被迟到加载恢复。解析失败的清理使用当前锁定Three r187的parser依赖cache收集已完成资源，该实现与当前Three版本一同验证。

## 实际验证

node evidence/company-asset-library-v1/qa.mjs执行19项真实GLTFLoader CPU检查，结果全部通过，逐项结果、配置和实现SHA见report.json。

已实际覆盖错误长度/SHA、外部buffer及图片URI、动画/骨骼/压缩、非有限变换、缺接触mesh及重名、空场景、并发单fetch、失败重试、实例几何/材质/纹理隔离、fetch中dispose、GLTFLoader等待内嵌图片时dispose、部分解析失败清理，以及真实lounge-sofa v1/v2两份GLB回读。

沙发v1实际631292bytes，SHA为a457c8e142f5745bb66140f0c15c1748cdcda63f536af5f119a16f7ee633116c。v2实际631248bytes，SHA为909662780545112153e591cffbe2463a0e2c3ad1727edd3f84b1a58c4e653c84。两者的seat-left/back-left/seat-right/back-right均为实际mesh。

贴图夹具使用真实GLTFLoader、Texture和TextureSource。CPU环境中createImageBitmap替身校验PNG各块CRC和zlib流后返回真实尺寸。独立运行python evidence/company-asset-library-v1/inspect-png.py通过Pillow严格verify及实际RGBA像素回读核验正例，证据见png-verification.json。原生浏览器解码由主代理复跑，本结果未建立浏览器/GPU、图像质量或真实角色使用通过。

## 实际浏览器发现后的定点修正

原正例PNG的IDAT CRC错误，且GLB只有POSITION、没有TEXCOORD_0。Pillow的宽松load可读其像素，严格verify明确报bad header checksum。旧字节保留为failed-triangle-textured-no-uv.glb，旧PNG为failed-original-texture.png，首轮CPU报告保留pre-texture-fix-report.json。原3e浏览器失败报告未修改。

GLTFLoader r187的loadTextureImage会捕获图片加载错误并返回null，原资源库未核对这一结果。本次同时检查LoadingManager错误及实际请求的texture依赖，失败候选释放已生成几何/材质/纹理并撤销失败blob URL。资源不会在缺图状态下进入缓存。正例triangle-textured.glb改为严格有效的2×2 RGBA PNG及实际UV；triangle-textured-bad-png.glb使用相同正确UV和原坏PNG，可在浏览器独立验证asset-texture-load-failed。另以有效PNG但缺UV验证拒绝及纹理清理。

新增footprint静态核对。两真实沙发的精确footprint通过，过小metadata在preload阶段拒绝并清理，已有合法缓存仍可实例化。该包络只覆盖默认模型的XZ静态范围，没有建立人物接触、通路或可达性结论。首轮三角正例metadata遗漏背面mesh的-0.2m Z偏移，已修正并保留failed-fixture-footprint-v1.json。

首轮非有限数夹具错误地使用仍然有限的1e308，现已改为JSON有效的1e999溢出数；原失败保留在failed-fixture-nonfinite-v1.json。另修正了报告隔离dispose计数的采样时点，避免把随后主动释放被测实例的事件写成互相影响。

本轮沿已知显式请求gpt-6.1-sol/high，difficulty complex，原因是异步准备、资源清理与实例隔离。实际provider配置与桌面Hook拦截未独立验证。未改其它产品文件、提交Git或运行浏览器/GPU。
