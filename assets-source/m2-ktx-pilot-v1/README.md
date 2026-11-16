# KTX2 源样件 v1

固定801原男女各提取 image0 身体颜色图与 image9 头发透明图。输入为 experiments/m2-runtime-transfer-801 下两个 final-package，manifest 锁定身体 SHA、图像字节、材质引用、实际网格 primitive 和采样参数。身体图全部 alpha255，材质声明 MASK。头发图实际包含透明与半透明像素，材质声明 BLEND。四图同时作为 MToon 主色与阴影乘色输入。

制作命令为 `python scripts/m2-ktx-pilot-v1/prepare.py --encode`。需先取得共享重型工作窗口。普通提取运行不编码。Python3.13.11、Pillow12.1.0，编码器采用官方 KTX-Software4.4.2 Linux x86_64 压缩包，在现有 Ubuntu WSL 内直接执行。工具下载、展开和源码许可证核对目录位于忽略的 tools 内。没有全局安装步骤。下载地址、官方发布摘要、实得 SHA 和工具版本位于 manifest。两份固定 VRM 的原字节保持原状。

四图只使用一套同分辨率配置，UASTC quality2，zstd18，threads4，sRGB/BT709，直通 alpha，top-left 方向，lanczos4 与 wrap 生成完整 mip 链。没有 RDO、尺寸缩小、通道重排或几何写出。尝试预算是一套候选及至多一次有原因的修正，本次编码全部成功，修正次数为0。

| 图 | 原PNG bytes | KTX2 bytes | 编码秒 |
| --- | ---: | ---: | ---: |
| 男身体2048² | 2713614 | 2417760 | 2.43 |
| 男头发1024² | 366352 | 373399 | 0.63 |
| 女身体2048² | 2982493 | 2560821 | 2.31 |
| 女头发1024² | 287349 | 313435 | 0.52 |

这些是文件大小与本机离线编码时长。两张头发KTX2比PNG更大。KTX validate 与 info 均返回成功，四图均为 UASTC、ZSTD、sRGB、straight alpha、rd 方向，身体12级、头发11级 mip。每级数据长度及命令原始输出保存在 evidence/m2-ktx-pilot-source-v1。KTX2文件大小与 UASTC 中间块数据长度均不能当作实测 GPU 显存。

## 运行对照合同

使用项目锁定的 Three0.187.0 KTX2Loader 和同包 examples/jsm/libs/basis 转码器，在实际 renderer 上调用 detectSupport。固定801资源字节作为源，实验加载器和注入脚本独立标记身份。

先完整 prepare 当前性别的两张压缩图，再对实际实例的目标材质同时替换 map 与 shadeMultiplyTexture。原始 map/shade 的共享关系、wrapS/wrapT、minFilter/magFilter、flipY、UV变换、颜色空间及透明参数须保持。原采样器 minFilter/magFilter 均为 LINEAR，wrap 为 Repeat。保留完整 mip 数据不等于应修改该采样器。

head hair 的原普通 Texture 是 neutralTexture 的 Canvas 输入。此函数不仅 drawImage，还会 clone 输入 Texture 后换成 Canvas Source。压缩纹理需要恢复为原普通 Texture 对象后进入现有染发入口。只替换 CompressedTexture.image 仍会保留压缩纹理类型与格式语义。实验可在原色时挂压缩图，染色前还原PNG，再用现有 appearance.set。恢复原色后显式重新启用压缩图。face/iris/brow 的 PNG 沿原路径保留。

浏览器须记录压缩实际格式、转码时长、mip 数据 bytes、RGBA回退、PNG/Canvas 副本、解码器依赖、失败保原、换人释放与实例隔离。原PNG留在CPU不证明GPU同时驻留，仍需看实际 Texture 使用和释放。染色生成的 CanvasTexture 需要另外计量。

本包完成源提取、单配置编码及文件检查。当前没有浏览器、视觉、动作、改色或GPU驻留通过结论。总工负责用相同光照、镜头和正常速度核原色/alpha边缘、MToon阴影、表情、染色及恢复路径。

## 原素材来源

图像由本项目原男女 VRoid beta 第三方导出模型派生，来源沿 assets-source/foundation/source.json 与 assets-source/foundation-male/source.json。原 .vroid 尚未找回，未逐字节匹配官方原编辑器导出。原元数据与使用条件继续适用。本包没有引入其他角色素材。
