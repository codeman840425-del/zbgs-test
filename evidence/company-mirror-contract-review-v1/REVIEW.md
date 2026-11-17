# 墙镜四款接入审查

2026-11-16。有界源码审查，基于工作树 HEAD `33fd619a654bc9b78f50930ec73301b14859c3f7`。核读项目 AGENTS、镜面研究、render.js、authoring.js、asset-library.js、preview.js、appearance-contract.js 及锁定 Three r187 源码。未运行浏览器、GPU、测试或构建，本文提出接入条件，不建立反射或恢复已通过结论。

本次请求配置为 complex、gpt-6.1-sol、high，使用独立有界审查。实际 provider 配置及宿主 Hook 拦截未独立核实。

## 可复用接缝

- `asset-library.js` 的 exact ID/version/URL/bytes/SHA 缓存、静态 GLB 校验、逐实例 geometry/material/texture 克隆继续使用。`describe()` 和 `validateResource()` 已有时钟、图文板校验扩展位置，可在这里接镜面合同与实际镜片校验。动态目标属于显示实例。
- `render.js` 约 104 行的 `instantiate()` 完成后已有实际节点 Map，约 147 行建立 facility。这里绑定镜片最小且能共享既有安装根、变换和 wallBinding。四款保持相同功能合同，仅镜片轮廓和框体映射变化。
- `authoring.js` 的 generation、preload、`prepareChange/commit/discard`、最终保存 current 检查继续作为编辑事务。CPU 验证或绑定构造失败时，`build()` 的 catch 可沿已有清理路径保留当前实例。
- `applyPresentation()` 已由主相机决定 cutaway、聚焦房间、墙挂设施和局部光源。反射消费这份结果，反射相机不调用 `setWallView/setView`。同楼层切房间会直接改可见性，必须同步重选活动镜面。
- `replace-resource` 已保留节点 ID、transform 和 state，且检查 `compareFacilityFunction()`。候选入口可沿 `appearanceBranches/createAppearanceSample/showAppearanceSample` 扩展，不另建预览世界。

## 必须解决的五处阻断

### 1. 镜片几何所在平面必须成为 Reflector 的对象原点平面

官方 `Reflector.js` 120–126、177 行只用 `matrixWorld` 的位置和旋转构造反射平面，没有从顶点求实际平面。若 GLB 镜片顶点直接位于 z=.026，而 Reflector 仍处在 z=0，即使屏上能看到镜片，反射和裁剪也会绕错误平面计算。

首包宜约束镜片和祖先为可明确验证的刚性变换，把实例镜片几何副本重基到局部 z=0，把 .026 平面偏移放进 Reflector 的位置，保留正确父变换和朝向。替换前后比较实际世界顶点，90°侧墙也应一致。拒绝非有限、退化、混合平面、反向三角形、负缩放或未支持的祖先补偿。不能仅检查包围盒、Mesh.normal 属性或“存在一个 +Z 三角形”。

原 GLB 镜片保留给校验和映射时，应隐藏它避免双层覆盖，框体继续显示。若保留原材质供回退，所有权须记录，不能在替换 shader 后把原材质遗失。分格款可用一个共面几何和一份目标，框条几何保留。

### 2. 活动预算必须由宿主统一决定

`preview.js` 159、241、242 行分别直接 `renderer.render(world,camera)`。Phaser target 30 只约束 update 路径，resize 和样件切换能额外渲染。每次 callback 自增 frame ID，或使用 `renderer.info.render.frame`，均无法表达宿主一帧上限。Three r187 每次嵌套 render 也增加该计数。

建议把三处绘制收敛到一个宿主请求入口，由 Phaser update 提供单调宿主 frame token 并合并 dirty 请求。初始化允许一个明确的首次显示窗口。每个 token 最多一次动态反射，额外主画面绘制共享预算或延到下一宿主帧。暂停预览时，显式单步也须走同一入口。候选预热单独计数，不能藏在主画面统计中。

每次显示前按当前 floor、room、祖先可见性、反射启用状态及候选镜片可见性确定至多一面。以稳定 ID 决策并在限制状态中指出第二面未启用。不要给四个候选同时构造四个 Reflector 目标。失去当前显示资格的绑定释放目标，重新进入时重新创建且首次刷新，building 模式没有室内绑定。

guard 必须在调用原官方 callback 前置为 reflection-pass 状态，临时隐藏其他全部反射面，并在 finally 恢复各自原值。只跳过第二面更新会让它以旧像素出现在反射里。仅设置其 visible 也应配合 callback guard，不能依赖 callback 内隐藏来取消已进入主渲染列表的物体绘制。主画面中超预算镜面要用明确的受限呈现。

### 3. finally 可恢复公开状态，但无法独自修复 Three 内部 render 栈

官方 Reflector 223–256 行会改 visible、XR、shadowMap.autoUpdate、target 和深度写掩码，却没有 try/finally。适配层须提前快照 target、active cube face、mipmap level、viewport、XR、阴影状态、forceUpdate、临时可见性和 guard，并在 finally 中逐项恢复。现宿主 DPR 可为 1.5，`getViewport()` 与 `getCurrentViewport()` 的坐标语义不同，不能把设备像素快照直接传给再次乘 DPR 的 `setViewport()`。按锁定源码核实恢复顺序，先恢复原目标，再恢复其 viewport。若薄层额外修改 scissor、autoClear 或 material，也纳入同一快照。

更深的限制在 `WebGLRenderer.js`。1688、1708 行 push 私有 `renderStateStack/renderListStack`，1837、1853 行仅在正常结束时 pop。反射内部物体 callback 真正抛错后，外面补 finally 并不会弹出这些栈。`resetState()` 3656–3664 行只重置 WebGL/binding/target 状态，也不处理它们。此处不能声称“catch 后继续 render 即完整恢复”。

最小处理应区分可控的绑定/预检失败和进入 `renderer.render()` 后的未知异常。可控失败正常拒绝候选。未知异常在宿主绘制边界结束该帧、禁用失败镜面并报告，随后经明确的 renderer 重建/恢复路径验证主画面。若本包要保证同一 renderer 的任意 callback 抛错后完整续绘，需先定位支持该承诺的实现，当前公开接口不足。不要通过污染真实场景的抛错测试后仅检查 XR/target 数值就宣称完整恢复。

shader 编译失败默认会走日志或 `renderer.debug.onShaderError`，通常不会自动让 JS 构造或 render 抛错。预热检查应收集该诊断并在正常 render 完成后拒绝候选，避免在 shader 回调内部抛错造成上述栈问题。context lost 时 `renderer.render()` 会提前 return，调用完成也不代表目标已产生有效反射。

### 4. 首次 GPU 失败保旧需要跨过当前提交边界

`prepareChange()` 375 行只 CPU build。`commit()` 383 行先删除 prepared handle，`install()` 275–276 行加入新根并释放旧根。首次 GPU 绘制在后续 preview 发生。此时失败已不能靠 `finally scene.discard(handle)` 找回旧实例，界面 `perform()` 却统一写“当前有效方案已保留”。

增加一个限定镜面候选的提交前检查接口，接到 authoring 的 apply，以及 load/import/restore、跨层/回到室内重建路径。CPU 构造后，使用当前宿主 camera/world 对候选做真实预热，保留旧 document/root/目标和存档字节。临时挂候选并遮住旧 root 时，必须 finally 恢复宿主图、主相机呈现状态和临时 root，不能调用会提交当前文档的现有 install。预热成功后才同步重查 generation/revision 并发布，失败完整释放候选。

若预热异步，等待后重查 authoring token 和 scene generation，discard 迟到候选。候选 handle 在 install 成功前保留可清理归属。相机/呈现状态在等待期间变化，应按最新状态重新核验所需首次刷新。

事务过渡会短时保留旧目标并创建一个候选目标，应明确区分“至多一个执行反射的活动面”和“转交窗口两个已分配目标”。若要求始终只能存在一个分配目标，就无法同时保留旧 GPU 目标原状并完成新目标预热，必须另作明确取舍，不能用活动数量掩盖分配峰值。

运行期设备故障与首次候选失败也需要不同提示。数据可以保留，已经被写过的同一 target 像素不能由 scene 事务回滚。首包无需为每帧双缓冲扩大预算，但要如实标注这条恢复边界。

### 5. 动态资源必须走每个 candidate 的统一释放路径

当前 `disposeTree()` 17–27 行只处理 geometry、材质直接纹理和 Light，既不会调用 Reflector.dispose，也不会释放其 WebGLRenderTarget。tDiffuse 位于 uniforms 内。给它补一个通用 Texture 遍历仍不能代替目标释放。

建议 build 一开始建立局部实例清理集合，绑定取得资源后立即登记，未放进 facilities Map 的半成品也在其中。用单一 candidate disposer 覆盖 build catch、discard、install 旧根、切层、building、scene.dispose 的 current 与 prepared。镜面 owner 释放 target/专用 shader/几何副本并清除 callback 和引用，操作幂等。通用树释放须排除 owner 已拥有的材质/几何，或先摘除镜面再释放静态树，避免 Reflector.dispose 与通用遍历双 dispose。

同层聚焦和 cutaway 可不重建树，所以在 `applyPresentation()` 之后也需调用活动资格调节，以释放失活目标。`assetLibrary.retainOnly()` 继续只释放静态缓存。测试须观察目标自身的 dispose 事件与 owner 计数，renderer.info.memory 仅作辅助。

## 最小代码落点

| 文件或入口 | 必要修改 |
| --- | --- |
| 新增镜面数据模块 | 固定单平面、墙挂、512²、samples=0、宿主最多一面等合同与实际节点映射校验 |
| 新增镜片几何模块 | 四款实际三角形、平面原点、+Z 朝向、有限轮廓及框条遮挡检查，返回可用于绑定的明确平面描述 |
| `document.js` 的资源校验循环 | 调用镜面合同校验，禁止只有映射没有机制声明的资产 |
| `appearance-contract.js` 的 describeFacilityFunction | 加入镜面机制及固定预算 profile，轮廓/节点映射留作适配数据，避免实时镜子与静态装饰被判等价 |
| `asset-library.js` 的 describe/validateResource | 接合同与几何验证，缓存仍只存 GLB |
| `render.js` 的 build/applyPresentation/disposal/prepare-commit/restore-setView | 实例绑定、活动资格、统一 owner 清理、提交前检查与失败归属。保留 contact-bearing facility 复用逻辑 |
| `authoring.js` 的 apply/replace/setView | 传递限定的宿主候选检查依赖，等待后重查 token，成功才提交，失败 discard/prune |
| `preview.js` 的三处 render 与 perform | 统一宿主绘制预算，提供真实 candidate preflight，明确区分候选拒绝和运行期渲染故障提示 |
| 既有资源生成/登记/样件链 | 四个 GLB 与共同合同、mirror 分支可点击入口、单镜代表布局及侧墙布局、具体限制说明 |

以上模块命名为实施建议。无需新增通用渲染框架、EffectComposer、第二个公司场景系统或角色控制系统。

## 下一包最小检查

1. CPU 验证实际四款几何，坏平面原点、混合朝向、重复节点、框条遮挡、机制或预算变化拒绝。四款 replace-resource 保 ID/transform/state。记录原始失败。
2. 用替身检查绑定中途失败、candidate discard、迟到 generation、失活重选、dispose 幂等、主帧多入口合并。finally 检查必须包括原可见性和 guard，不能统一恢复为 true。
3. 真宿主每款逐一反射非对称可移动对象及钟/图文状态，含主镜头外对象、镜头移动、侧墙90°、背面与掠角。每次初显确认 fresh pass，图像证明与 pass 计数同时保留。
4. 实际首次绑定/预热故障保旧实例及存档字节。另记录 renderer 真内部异常的恢复边界并验证后续主画面，区分“公开状态恢复”和“renderer 整体续绘”。
5. 同层切房间、cutaway、跨层、building、四款互换、关闭恢复及 scene.dispose 逐项核目标 owner/dispose，隐藏后零反射。第二面受限呈现不能显示旧层纹理。
6. 统计宿主 token、主 pass、reflection pass、预热 pass、活动与已分配目标数、尺寸/MSAA、draw calls/triangles。Three info.autoReset 会在嵌套 render 中重置统计，需在受控窗口手动采集或单独 pass 计数并恢复设置。

沿研究的一次官方小样加一轮有根据修正预算。普通电脑性能、多镜互反、落地支撑、化妆镜灯与三折表面均待各自证据。

## 审查文件身份

| 本地文件 | SHA256 |
| --- | --- |
| `prototype/src/company/render.js` | `25170686e9992a1bb9380cd142c4148ec39e11c7eb3ffe610c593292c5848574` |
| `prototype/src/company/authoring.js` | `01ca258ca73600ba09a46909131d1b77f4b6b17948987069cd79cbddc1d98b7b` |
| `prototype/src/company/asset-library.js` | `4ea84322e46911ee612fe312f4db8bccf8c1825a645e5adf25fafcd397cf5de4` |
| `prototype/src/company/preview.js` | `1a985ffa2a27499655e458fbc02b2d6f8fbf0050a8f539bd8295f7994f032691` |
| `prototype/src/company/appearance-contract.js` | `5165094c54be94deb84a6b65e541f3b13c9267782e8fca33fa82289b22ec5db1` |
| `prototype/node_modules/three/examples/jsm/objects/Reflector.js` | `542861de2dea2e24729a1fa4962424214e1637368017bdd48d5f27eb64dda0fb` |

Three 版本为 0.187.0。官方算法、shader 与许可沿镜面研究记录的 r187/MIT 来源，本文没有重新进行网络研究。
