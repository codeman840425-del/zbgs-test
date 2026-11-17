# 原生双虹膜自然绿样件

固定男性c936b编辑源在Studio2.16/Bridge0.15中，仅把左右Iris OverlayColor设为RGBA `(79/255,122/255,74/255,1)`，即`#4f7a4a`。选择一次色值，无扫色。保存副本、冷开读值完全一致，其他虹膜参数和原生组未变。VRM1关闭减面与透明删除，warnings为空。原生闭环32.118秒，其中导出18.207秒。进入时的male-before-skin-study文件已恢复，ready且dirty=false，原文件SHA不变；没有桌面输入。结束后已释放原生/GPU窗口。

新源为`generated/male-iris-green.vroid`，导出为`generated/male-iris-green.vrm`。此VRM仍保原a18遮罩Body，不能当7586完整皮肤新基体。`cpu-readback/iris-green.png`是直接提取的原生1024×512 PNG，主图与shade同源；`iris-material.json`记录实际EyeIris消费者、UV、采样器和全部原材质值。独立提取重跑于内存，字节与消费者描述一致。

139个accessor逐typed bytes一致，包含所有位置、normal、索引、UV、骨权与IBM和真实morph。原91节点、79骨skin、mesh、原生表达、spring与其余extension及授权meta均未改变。材质/纹理引用和采样器也完全相同。21张图片中实际仅虹膜image3和导出缩略图image18改变，眼白、高光、Body及其他图片encoded bytes原样。完整逐项证据在`cpu-readback/result.json`。

已实际查看提取的原棕色与绿色PNG。两侧瞳孔仍为中央深色椭圆，上暗下亮、光斑和细节布局仍可辨。此次图像观察不代替游戏相机近景。85632像素发生变化，alpha逐像素相同，2208个原纯黑可见像素原样。原图没有纯白可见像素，不能把空集合称白高光实测。独立EyeHighlight图片字节不变。固定maxRGB≤32的暗区由17090扩大至30833像素，因此没有宣称瞳孔暗像素逐值不变或严格解剖分区通过。该阈值只作诊断。

后续root可消费独立PNG与`manifest.json`的精确source image、材质消费者和候选身份。现有7586的虹膜原图片与a18相同，仍应由运行适配明确核对当前source/body、主图/shade和可变材质所有权，加载后保MToon更新与恢复。不需新增人物动作控制器，可能需要新颜色资源的数据准入/配方记录。整个人物VRM是源生产证据，不能用其替换来冒充独立虹膜颜色接入。本包没有public/catalog/runtime修改、游戏或正式视觉通过。

使用原call.py的完整请求、stdout/stderr、返回及耗时在`requests/`和`records/`。`native_cycle.py`是一次原生闭环入口，当前目录排他写入拒绝再运行。重建需在独立新包/检出中保原包，先验证固定c936b和已知进入状态，再执行`call_step.py 01-status vroid_status '{}'`、`native_cycle.py`、`readback.py`及`close.py`。脚本始终核真实源SHA，未知/dirty状态不会替用户丢弃内容。完整源导出的字节跨原生工具运行确定性未证明，独立图片提取字节确定性已验证。不要为了复现而覆盖本包或再次占用未协调窗口。

插件仍为已固定mcjo79 Bridge0.15，工具MIT许可与pixiv素材许可分别适用。原导出meta仍为onlyAuthor/personalNonProfit、禁止再分发、modification prohibited，没有修改授权。仅内部作者技术样件，未新增商业/分发许可结论。
