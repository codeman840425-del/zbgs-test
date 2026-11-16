# 双座沙发参数源

`baseline.json` 和 `variant.json` 是可编辑米制参数输入，生成脚本从零构造网格。两版分别输出 `lounge-sofa` 资源版本 1、2。几何和纯色粗糙材质均为项目新制，无外部美术素材。

在工程根目录运行下面命令。

```powershell
node scripts/company-platform/build-sofa.mjs
node scripts/company-platform/build-sofa.mjs --check
node evidence/company-sofa-production-v1/verify-disk.mjs
```

脚本每个输入独立构建两次并比较 GLB 字节，再经 GLTFLoader 检查。`--check` 重新生产并比对磁盘产物。独立磁盘验证器直接读取 GLB 和 resource.json，不调用生成器。

坐标为米制 Y 向上、局部 +Z 朝前，原点在地面中心。`seat.height` 是坐垫顶面高度，基准和变体均为 0.47 米。左右座面中心 X 为 ±0.48 米、Z 为 0.04 米。使用点位置是座面中心在地面的投影，接近点 Z 为 1.02 米、离开点 Z 为 1.15 米。所有节点保持单位缩放。

变体调整扶手宽高、靠背高度/圆角/顶部收窄比例及面料配色。参数中的 `back.topTaper` 直接修改靠背顶点横向外形，并重新计算法线。两独立坐垫和靠背保留稳定名称，便于后续使用点解析。

当前仅有 CPU 导出及文件回读证据。浏览器预览、人物使用、接触、接近与离开动作仍待相应阶段验证。
