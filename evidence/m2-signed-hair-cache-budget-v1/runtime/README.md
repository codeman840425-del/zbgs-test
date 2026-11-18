# 已签制服角色的配色缓存

固定运行包 `5859bd00da8b` 在开发机 Chrome 157 和 RTX 4090 上读取两份签名记录。`uniform-1k-female` 使用金色短发、暖肤、棕瞳和珊瑚唇色。先恢复肤色，再恢复所有颜色，最后重新应用签名外观。第二组用原女性记录及另一个独立签名的测试身份加载同款外观，逐人销毁。测试身份绑定相同配方，未加入生产记录清单。[完整观测](./full-look.json)

| 部件 | 每人独立 Canvas 和 Texture 对数 | 每张尺寸 | 单份 Canvas RGBA8 像素估算 |
| --- | ---: | ---: | ---: |
| 原发和替换短发共用 | 2 | 1024 × 1024 | 8,388,608 B |
| 眉毛 | 2 | 1024 × 256 | 2,097,152 B |
| 虹膜 | 2 | 1024 × 512 | 4,194,304 B |
| 唇色所在脸部 | 2 | 1024 × 1024 | 8,388,608 B |
| 合计 | 8 | | 23,068,672 B |

每个部件的 `map` 与 `shadeMultiplyTexture` 用两个原始 Texture，引用同一个原始 Source 和图像。染色后两槽各自绑定一个 Canvas、一个 Texture、一个 Source，并各有一个活动 WebGL 句柄。八张纹理均为线性过滤，未生成 mip。面部正面与轮廓材质复用两张唇色纹理；眉毛和虹膜在这个模型上各只出现一份材质。短发使用的纹理与隐藏的原发相同。仅把暖肤恢复原色，身体及脸部正面和轮廓的 Texture、Source、图像与句柄均相同，材质的 RGB 乘数发生改变。

恢复原色后，四个头眉缓存和四个五官缓存继续存在，再换回签名颜色使用先前的八个 Texture UUID。两个同款女性实例各自持有八套对象。先销毁一名，另一名继续保有八套；全部销毁后，观察过的 34 个 WebGL 句柄均失效，渲染器回到初始的 1 个纹理、1 个几何对象。像素估算只覆盖八个持久 Canvas 各一份 RGBA8 内容。浏览器内存、遮罩数据、临时像素数组和显存没有字节测量值。

从主检出使用固定的 operator、runtime 和导出包执行以下命令。参数是本次报告名，已有同名文件会拒绝覆盖。浏览器只接收由 inventory 验证过的本地文件，临时 Chrome 数据在本目录内创建和清理。

```powershell
node scripts/qa-signed-hair-cache-budget.cjs repeat-01
```

完整报告中，`observed.first`、`skinControl`、`restored`、`again` 及 `twins` 各快照包含角色身份、加载的记录摘要、实际选项和材质。沿 `materials[].slots` 的 UUID 查同快照的 `textures`，读取尺寸、Source、图像身份、mip、过滤和句柄。用 `uses[].visible` 区分已绑定的隐藏和可见网格。`sourceToDerived` 列出按部件配对的原色及染色 Texture。实际销毁事件见 `disposePrimary` 和 `disposePeer`。

首次独立头眉测量及当时的脚本快照保留在本目录。[首次测量](./report.json) · [首轮脚本](./hair-only-runner.cjs)
