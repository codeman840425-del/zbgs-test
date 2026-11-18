# 制服上衣的发布纹理预算

下一件可复用样件建议做**独立衣物的不透明底色图半尺寸 PNG 派生**。固定现有 GLB 和选中材质的底图，将 2048² 上衣图在直线光空间以 2×2 面积平均成 1024²。领带保留 256²。原始男衣和另一套女衣都能沿现有 GLTFLoader 路径使用此格式。以下在 CPU 内存中解码、重采样和编码了实际图片。新服装 GLB、装备登记和房间画面对照仍待制作。

## 22,719,144 B 的来源

原始男体 `ab9af434…` 的 mesh 1、primitive 4/5 分别用材质 10/11。上衣的 glTF baseColorTexture、VRM0 的 `_MainTex`、`_ShadeTexture` 都指向 texture 17，领带的三个槽都指向 18。两件在 VRM0 另有共用的 normal 1、sphere 10、emission 2。独立上衣 GLB 只携带已经验证的 unlit 底色与 alpha 合同，只有下列两个纹理对象。源许可和旧 MToon 的差异沿用原回执。[原始装备与提取回执](../../m2-raw-male-equipment-v1/outfit-report.json)

| 独立男衣 | 实际引用 | PNG 字节 | RGBA8 基级 B | 完整 mip B | PNG SHA-256 |
|---|---|---:|---:|---:|---|
| 上衣 | mesh 0 primitive 0 → material 0 → texture 0 → image 0 → view 6 | 2,601,557 | 16,777,216 | 22,369,620 | `f66035cb7e68db1c6dd93d70bc6f9e8823dfad40020ff087563154354ae06774` |
| 领带 | mesh 0 primitive 1 → material 1 → texture 1 → image 1 → view 13 | 46,655 | 262,144 | 349,524 | `b17f6b5505ec66084136418e035fcf252e3d0e61adfaf36de4f311f01f7a1ce6` |

两份 PNG 的身份、内容和尺寸都不同，各自与原 VRM 图 17/18 的实际嵌入字节 SHA 相符。texture 0/1 虽各用一个内容相同的 sampler（min/mag LINEAR、S/T REPEAT），合并 sampler 定义可节约的纹理像素为零。两材质均为 UV0、双面、白色因子、MASK，默认 cutoff 0.5。两个 primitive 分别引用 6,012、276 个索引元素，共用含 10 个关节、IBM accessor 12 的 skin 0。上衣 UV 实际覆盖 U 0.0452–0.9536、V 0.0046–0.9932。上衣两轴的实际跨度使直接裁去大片边缘难以达到所需差额。[现有回读](../fit/report.json)

`m2-technical-v1` 对每个 texture 的 image 按 RGBA8、宽高逐级取半至 1² 求和。本件两个对象对应两张独有图，总计 22,719,144 B，超过单件 16,777,216 B 上限 5,941,928 B。实际原始 PNG 合计 2,648,212 B，在文件中各存一次。项目锁定的 Three GLTFLoader 对显式 LINEAR minFilter 关闭自动 mip，男衣两张图的 RGBA8 基级合计 17,039,360 B。设备分配和实际 GPU 释放由浏览器测量。[预算实现](../../../scripts/production/asset_budget.py) · [本套预算](record-budget.json)

## 三件实际 GLB 的同法对照

| GLB 与适配体 SHA 前缀 | 两张原图 SHA 前缀 | 衣袖/领带绑定 | 1024² 底色 PNG 实测字节 / SHA 前缀 |
|---|---|---|---|
| 原始男衣 `10a51cbd…` / `ab9af434…`，精简体 `cf1118a2…` 也借用同 GLB | `f66035cb…`、`b17f6b55…` | 10 关节，显式 LINEAR | 581,316 / `ddf9232c…` |
| M1B 重导出男衣 `393a2a97…` / `62b44b03…` | 同上 | 10 关节，省略 sampler | 581,316 / `ddf9232c…` |
| M1 女衣 `27bcfe02…` / `027bed60…` | `92775860…`、`f76d259a…` | 16 关节，省略 sampler | 571,539 / `a9ef7bf1…` |

三件的两个源图均全幅 alpha 255，各自用了不同的身体或装备 SHA。M1/M1B 省略 sampler 时 Three 默认 minFilter 为 LinearMipmapLinearFilter，应保留源 sampler 的缺省语义。三个样件都可将单件静态成本降至 **5,941,928 B**，各减 16,777,216 B。原男衣无 mip 的 RGBA8 基级模型降至 4,456,448 B，差额 12,582,912 B。男衣/女衣替换的编码图分别少 2,020,241 / 1,931,927 B，GLB 对齐和新元数据另计。派生身体原有的 109,402,460 B 纹理上界另列。[男衣目录](../../../prototype/public/assets/m1b/equipment.json) · [女衣目录](../../../prototype/public/assets/m1/equipment.json)

1024² 探针在内存按完整 sRGB 转换、面积平均、回编码并取最近整数，全程 alpha 为 255。把结果按 2×2 复制到原始网格，各 RGB 通道与原图逐值比较，男/女平均绝对差分别为 0.5014/0.5006（0–255），两者第 99 百分位为 7，最大为 94。高频边线确实有损，需检查近景衣领纹样及运动时的闪烁。图像差值覆盖整张图，未按屏幕可见面积加权。

## 发布与验证边界

- 源许可沿各装备项的 `sourceLicense`、输入 GLB/PNG 哈希、适配体原始来源和固定配方记录。男女原型均有第三方发布的 VRoid beta Base 来源，归档保留发布者声明和未与原编辑器导出逐字节匹配的限制。此法只处理已证明全不透明、UV0、unlit baseColor 的指定 PNG。拒绝混用法线、遮罩、头发或待着色的 Canvas 输入。
- 先跑原提取及 fit 校验，其要求原底图摘要相等。另行生成带父 SHA、派生 PNG 摘要、操作与版本的新 GLB 和装备项。逐字节对照全部保留几何、UV、权重、逆绑定、领带、材质参数、采样器和父体兼容；读取实际结果证明只换了选中图。切换记录、错误 SHA 和重开恢复均沿既有装备层检查。[原底图校验](../../../scripts/production/raw_male_equipment.py) · [原 fit](../../../scripts/production/stripped_outfit_equipment.py)
- 复用既有房间相机、动画时钟、原始骨架对齐和像素对照，先查站立、坐姿和同近景衣领，随后看动作中布纹与边缘。旧/新各从自己的固定装备目录读取。采集纹理尺寸、实际 minFilter/mip、上传和最终退出释放。保留原版可回滚；有清晰可见的破损时保留失败，不继续扫分辨率。[房间对照脚本](../../../scripts/qa-source-outfit-release.cjs)
- 顾问将 HTTP、GPU 压缩和运行生命周期分别衡量。已有 801 男/女 KTX2 已通过开发机诊断，两个采样图转成 BC7 全 mip 时为 6,990,560 B，原图 RGBA8 基级为 20,971,520 B；CPU 转码字节与实际物理显存仍须分别记录。那批是体色与发色图，旁车有自己的原图和解码器 pin，实验还保留 PNG 与 Canvas 回退。当前静态预算入口只读取 PNG/JPEG。若采用 KTX，需要独立装备槽加载/释放验证和适配预算算法。普通 PNG 派生可以先用现行单件口径检查真实资源。[顾问原报告](../../../docs/research/RESOURCE-COMPRESSION-GAME-PRACTICES-2026-11-16.html) · [KTX2 对照和净下载限制](../../m2-ktx-room-comparison-v3/summary.json) · [FaceContour 身份核对](../../m2-native-batch-adaptation-v1/KTX-BUDGET-REPORT.md)

## CPU 复算

从工程根运行，环境为 Pillow 12.1.0、NumPy 2.4.2。输出到控制台；编码仅使用内存。

```powershell
@'
from pathlib import Path
import hashlib, io, sys
import numpy as np
from PIL import Image
sys.path.insert(0, 'scripts/production')
from asset_budget import AssetCost
from flow import GLB

assets = Path('prototype/public/assets')
paths = ['raw-male-equipment-v1/raw-male-ab9a-uniform-top-v1.glb',
         'm1b/m1b-uniform-top.glb', 'm1/m1-uniform-top.glb']
x = np.arange(256, dtype=np.float64) / 255
linear = np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)
for name in paths:
    path = assets / name
    glb = GLB(path.read_bytes())
    doc = glb.doc
    print(name, hashlib.sha256(path.read_bytes()).hexdigest(), doc.get('samplers'))
    for primitive in doc['meshes'][0]['primitives']:
        material = doc['materials'][primitive['material']]
        tex = material['pbrMetallicRoughness']['baseColorTexture']
        index = doc['textures'][tex['index']]['source']
        row = AssetCost(path).images()[0][index]
        view = doc['bufferViews'][doc['images'][index]['bufferView']]
        pos = view.get('byteOffset', 0)
        image = Image.open(io.BytesIO(glb.binary[pos:pos + view['byteLength']])).convert('RGBA')
        a = np.asarray(image)
        assert np.all(a[..., 3] == 255)
        print(material['name'], tex, index, row['encodedBytes'], row['sha256'], row['rgba8MipBytes'])
        if image.size != (2048, 2048):
            continue
        avg = linear[a[..., :3]].reshape(1024, 2, 1024, 2, 3).mean(axis=(1, 3))
        c = np.rint(255 * np.where(avg <= .0031308, 12.92 * avg, 1.055 * avg**(1/2.4) - .055)).astype('uint8')
        png = io.BytesIO()
        Image.fromarray(c).save(png, format='PNG', compress_level=6)
        e = np.abs(a[..., :3].astype('int16') - c.repeat(2, axis=0).repeat(2, axis=1))
        print(len(png.getvalue()), hashlib.sha256(png.getvalue()).hexdigest(),
              round(e.mean(), 4), np.percentile(e, 99), e.max())
'@ | python -B -
```
