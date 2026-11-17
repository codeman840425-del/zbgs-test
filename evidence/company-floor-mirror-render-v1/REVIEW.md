# 落地镜共享反射运行检查

2026-11-16。核读落地镜合同与有界预检，仅新增 `scripts/company-platform/qa-floor-mirror-render.mjs` 和本目录证据。其余源码只读，没有修改旧 QA、旧证据、资源、CAP 或 CURRENT，没有运行浏览器、GPU 或构建，也没有提交 git。

## 检查结果

`extended/report.json` 的 26 项 CPU 检查通过。初次 21 项结果保留为本目录 report.json，随后依根代理明确补核非数组位置，五种输入均使用领域错误拒绝。当前没有在本次有界范围内发现阻断。

- 落地镜完整位置 [0,.92,.026] 被复制保存，外部改写 resource.mirrorSurface.position 或 getter 返回数组不会改变绑定平面。缺失、null、字符串、普通对象、TypedArray，以及错误 Y/Z 和 NaN 均在目标分配前拒绝。
- 实际 Three Reflector 的几何减去完整位置并由对象变换放回。yaw=0 与 yaw=90°、设施平移后的最大世界顶点误差均为 1.668930060816365e-8 m，低于检查容差 1e-7 m。该数值来自合成 Float32 矩形镜片。
- yaw=90°的世界锚点为 [1.026,.92,-2]，法向约为 +X。原相机 [4,.92,-2] 的真实 Reflector 镜像相机为 [-1.948,.92,-2]，与平面反射公式一致。目标仍为512²、HalfFloat、MSAA0。
- 同一 world、同一 controller 中放入墙镜和落地镜，稳定选择最多一个活动 owner，宿主 token 和30Hz准入共用。隐藏原活动墙镜后，落地镜也受原宿主帧额度约束，没有按安装分支另建预算。
- 隐藏落地镜会释放原目标，重新进入会创建新目标并产生 fresh pass。背向和视锥外均不分配目标。反射期间墙镜与落地镜表面共同排除，原可见性最终恢复，隐式 Reflector callback 保持 noop。
- 候选落地镜预热期间保留原墙镜目标，实测目标对象同时数为2。候选 discard 释放自身一次，失败 shader 预检也释放候选，原墙镜目标引用不变。丢弃 owner 不会重新激活。
- 未知 renderer 内部异常返回 mirror-renderer-reset-required，公开 target/viewport/scissor/XR/shadow 状态恢复，失败 owner 释放。此项不证明 Three 私有 render 栈能够继续使用。

落地扩展检查共16个镜面目标对象创建、16次dispose，live=0、peak=2。这些是对象与dispose事件计数，不是GPU显存测量。

## 原墙镜回归

使用现有 `qa-mirror-render.mjs`，只指定本目录的新输出路径 wall-regression。原23项CPU检查全部通过，24个目标创建、24次dispose、live=0、peak=2。新增脚本还单独核墙镜 [0,0,.026] 的重基和镜像相机，以及墙/地功能签名不兼容。

这部分核墙镜共用运行语义，未重新核四个原墙镜GLB的资源字节，未给原固定录像换版本身份。

## 复现与边界

命令为 `node scripts/company-platform/qa-floor-mirror-render.mjs evidence/company-floor-mirror-render-v1/extended`，墙镜回归为 `node scripts/company-platform/qa-mirror-render.mjs evidence/company-floor-mirror-render-v1/wall-regression`。脚本支持可选输出目录，避免覆盖历史证据。

测试使用锁定Three实际Reflector及有限renderer替身，没有复制运行控制器或反射算法。合成镜片不包含真实底座、立柱和背板，实际GLB共面/遮挡/支承验证由几何包单独负责。坏平面检查在本范围内指数据合同和绑定位置拒绝，不把它扩称为实际网格检查。

真实像素、shader编译、设施安装/阻挡、剖切联动、文档事务与关闭恢复仍需根代理在宿主验证。对象隐藏测试只证明实际祖先visible路径，没有假装执行真实setView或cutaway。普通电脑性能和角色C3不在本次CPU结果范围内。

本次源码身份见 extended/report.json。mirror-render.js SHA256为 `3dd2ad987a6490c5dbc5fcd4c8a9fb88ec52595a5f7c2f5cf4faa393001da5a0`，mirror-data.js为 `f390a350f2dd194fe1378266753367cd38821c6d19a9339a674a25ae30e88bff`。新QA脚本SHA256为 `97bc05f9bfbc1b549c3b2ad88c62eb16b6d8efd53883e07e9e83307a550ff701`。

派工请求沿已知gpt-6.1-sol/high。实际provider配置和宿主Hook拦截未独立核实。
