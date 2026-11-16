# 离线制作与实验注入

prepare.py 提取固定801的原图并制作一套同分辨率KTX2。它只写本包目录。编码命令为 `python scripts/m2-ktx-pilot-v1/prepare.py --encode`，执行前由总工分配重型窗口。只运行 prepare.py 会重新提取和写源报告，保留的正式编码证据以已提交 source-report.json 为准。

runtime-adapter.mjs 不改固定801源码，也不写VRM。createKtxPilotAdapter 接收现有 vrm、appearance、renderer、sourceManifest、decoderManifest 和同安装Three187的 THREE/KTX2Loader。sourceBaseUrl 必须指向仓库根路径的只读HTTP挂载，transcoderPath 必须是以斜线结束的绝对URL。

browser-inject.mjs 提供固定801专用入口。总工可用实验服务器将仓库根目录映射到独立前缀，并在原固定包正常入口完成加载后注入。以下示例假定只读挂载为同源 `/__repo/`。

```js
const {createPilotForCurrentAvatar} = await import('/__repo/scripts/m2-ktx-pilot-v1/browser-inject.mjs');
const pilot = await createPilotForCurrentAvatar({repoRootUrl: '/__repo/'});
await pilot.prepare();
pilot.applyOriginalKtx();
pilot.snapshot();
await pilot.withCanvasAppearance(() => __debug.avatar().appearance.set({hairColor: 'blonde'}));
pilot.applyOriginalKtx({bodyOnly: true});
await pilot.withCanvasAppearance(() => __debug.avatar().appearance.set({hairColor: 'original'}));
pilot.applyOriginalKtx();
pilot.restorePng();
pilot.dispose();
```

注入入口读取固定build身份、当前avatar.profile原SHA及材质尺寸。它核对加载器文件SHA，添加供实验模块使用的Three import map，然后动态导入同安装的Three0.187.0与KTX2Loader。初始固定包加载、动作、VRM扩展均走原入口。实验代码使用独立模块身份，在后续浏览器报告中单列。

prepare 先读取并SHA核对实际JS/WASM字节，再经Blob交给KTX2Loader，避免重复网络下载。转码前同样SHA核对KTX字节。snapshot 记录源URL的实际fetch、字节/摘要/时长、加载器实际消费的已核Blob、转码时长和所得纹理格式/mip数据。transcodedMipDataBytes 是CPU转码数据长度，GPU实际驻留仍待验证。原PNG对象保留供Canvas读取。

prepare 在全部样件完成前不修改map，失败清理已完成样件。map/shade原先共享同Texture时，压缩视图也共享同一实例Texture。restorePng 恢复捕获的原对象。applyOriginalKtx 默认读取appearance.getState，只有原发型和原发色才可切全部图，bodyOnly只切身体。withCanvasAppearance仅将本实验拥有的KTX引用交还原PNG，再执行既有appearance操作；已经生成的Canvas保持。被拒绝的下一次请求不重置原Canvas，迟到失败不覆盖新状态。实际材质状态以snapshot为准。

同一场景实例只能持有一个adapter。换人前先dispose并等待在途prepare完成，再释放avatar。dispose只恢复实验自己持有的压缩引用，已有Canvas引用交还现有appearance管理，避免销毁外部纹理。若需再次测试同一实例，应先恢复原色并还原PNG，再创建新adapter。

releaseInactiveGpu 是单独调用的实验入口。它只候选本adapter持有的原PNG和prepared KTX。每次dispose前重新遍历VRM及其当前附着父场景，核查所有材质直接Texture字段、嵌套uniforms、customDepth/customDistance/override材质以及背景和环境。活动Texture共享同一Source时也保留。候选、未释放理由、发现的引用、释放请求及扫描失败进入返回值和snapshot.events。retained表示此次未请求dispose，其reason会区分活动引用和此前已释放。

确认闲置后只调用Texture.dispose，保留普通PNG image及KTX mip CPU数据。它不会关闭ImageBitmap或释放外部纹理。后续restorePng/applyOriginalKtx复用原Texture对象，标记needsUpdate以便再次上传。同一段闲置期重复调用会跳过已请求释放的纹理。该扫描覆盖当前附着场景，其他独立场景和自定义渲染回调中的隐藏引用不在本实验可核范围内。释放记录表示dispose请求，实际GPU资源变化须看浏览器新证据。

以下可选序列用于总工的新浏览器检查。现有浏览器报告保留原始适配器身份。纹理源和编码配置不变。

```js
pilot.applyOriginalKtx();
pilot.releaseInactiveGpu();
await pilot.withCanvasAppearance(() => __debug.avatar().appearance.set({hairColor: 'blonde'}));
pilot.releaseInactiveGpu();
await pilot.withCanvasAppearance(() => __debug.avatar().appearance.set({hairColor: 'original'}));
pilot.applyOriginalKtx();
pilot.snapshot();
```

CPU入口为 `node scripts/m2-ktx-pilot-v1/check-adapter.mjs`。原14项结果保留在 evidence/m2-ktx-pilot-source-v1/adapter-cpu.json。新增10项释放检查和原14项一起运行，当前24项结果写入 adapter-gpu-release-cpu.json。它使用真实Three187 Texture/CompressedTexture/LoadingManager及模拟fetch/转码，核当前引用保护、外部材质与uniforms保护、Source别名、阴影材质/环境、CPU图像/mip与对象恢复、重复调用、dispose监听重绑定及扫描失败保留。报告保留实际返回的部分释放/失败记录。该检查没有执行真实浏览器、WASM转码、GPU或视觉验收。

实际浏览器v3与原失败/修复见 evidence/m2-ktx-room-comparison-v3 和 evidence/m2-ktx-independent-v1。正常动作片与暂停静态对照分开标记；不声称全库压缩、净下载降低或普通机通过。
