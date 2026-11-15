# 少褶裙 v4：隔离运行诊断，未准入

基线为 `aed9597` / 固定 269，独立分支 `codex/simple-skirt-v1`。源 v1–v4 checkpoint `dd687ca` 已推远端。没有改共享 main、motion、foundation-avatar 或公开 269；也没有替换默认裙。候选 `17034f3fffc1` 仅以 `?skirtSample=v4&handTarget=authored` 显式启用。

## 接入事实

资源先经过既有 equipment 的 body SHA、GLB SHA、骨名及 inverse bind 校验，再由本装备 adapter 替换六个 Skirt helper 的 skin palette 节点。私有节点不注册 humanoid/spring，父语义仍为左右 UpperLeg；保留原 inverse bind。源上腰含 hips/spine/chest 权重，不把“六骨私有”当作整个面自动同帧的证明。

实际 `meshRoles.skirt` 与 `seatHandSurfaces` 均包含两个可见 SkinnedMesh：

| primitive | 顶点 | 面 | 材质 |
|---|---:|---:|---|
| 保留上腰 `m1-sixfold-skirt-v4_1` | 162 | 120 | 原制服 cloth，alphaTest .5 |
| 新下摆 `m1-sixfold-skirt-v4_2` | 1230 | 2300 | 新深蓝 cloth，alphaTest 0 |

两网格 group 均为空，分别具有一个真实材质；不是只查询第一个 primitive。旧 `M1_UniformSkirt_Constrained` 为 0 个，旧 guide 不参与此分支。完整身体仍可见/存在；仅原独立重复衣物隐藏。

真实 body 大腿采样左右各 110 点，97% 半径约 77.817 mm，加既有 9 mm 手间隙，向手层提供 86.817 mm，未缺省早退，未复用旧裙壳伪造测量。

## 数值、运行和可见结论分开

源静态 standing gate：body 0，closed-top 400 对，其中原内部 cap 210、其余 190；椅 0，内折边自交 1。新下摆权重四影响剪枝最大损失 4.4297%。这些失败没有改变门槛，不能扩大 body 0 为整套通过。

实际正/侧坐起重探针共 1702 子步，每步在手查询之后与最终模拟更新之后比较 **全部 1392 顶点**，两个 primitive 最大差均为 0，每步均有手修正记录。另坐稳 speaking ON/OFF 各 240 子步，加坐入共 780 子步，全点最大差也为 0。此证据说明这些已测组合的手前面与最终显示面一致；不代表 mic/greeting/舞蹈等所有叠层均已验证，也不等于最终手皮肤零穿插。

GPU 截图可见：站姿上衣下摆仍有深色扇形片外露，保留细褶腰圈与平滑新下摆存在明显外观断层；当前浅六褶远不算合格美术成品。坐稳前裙落到大腿下，大腿上方无应有覆盖，后下摆挂向椅面；起身才恢复。**装备坐姿响应尚未制作**，这是缺失行为的真实失败图，不是经过作者控制验证后否定路线。

唯一浏览器 error 已定位 `http://127.0.0.1:<临时端口>/favicon.ico` 404；未看到 GLB/纹理/JS 加载失败或 WebGL shader 错误。原记录仍保存，不抹除报错。

重探针录像设置 playbackRate=1，但墙钟比率不达 1：正面模拟 6.6669 s / 墙钟 7.358 s = .9061；侧面 6.7093 / 7.2761 = .9221。不能把这条片称真实正常 1× 性能。它是形状/数值诊断，附加每子步蒙皮读回产生明显观察开销。无重探针补录：正面模拟6.3499 s / 墙钟6.3809 s = .99514；侧面6.2907 / 6.3176 = .99574。本次接近真实1×，不等于目标设备性能或整套服装通过。完整时序2fps抽帧已看，失败贯穿坐稳而非瞬间挑帧。

证据：`evidence/simple-skirt-v4-17034f3fffc1/`，含完整重探针片、十张真实 GPU 姿势图、完整 report/trace gzip。完整时序已按 2 fps 抽取查看明显失败；这不是逐帧 CCD 或实时听觉/整套动作验收。

## 下一最小装备响应方案（尚未实施）

仅为这一件 v4 制作一组可编辑坐姿响应，保持独立 asset ID、原裙对照和原人体动作。原 120 面上腰与 20 点接缝边界不动，上衣外露另按真实层序诊断，不用坐姿形变把它盖住。

1. 用 raw hips 构造装备参考系；左右 raw UpperLeg→LowerLeg 方向在该参考系中的有符号前屈角作为连续输入。前向来自 VRM 人形/源 bind，不能把世界 Z 或原骨 Euler X 当作轴。左右腿各自测，避免镜像时符号互换。绑定到六个私有 helper 的相对变换，在手采样前求值；保留当前已测同帧时序。
2. 前侧两个 helper 承担腿面覆盖，主要转轴为 hips 左右方向，支撑区取实际新前裙下摆与实际大腿上侧，不能用旧裙 guide。两侧 helper 连接前后片，后侧两个 helper 抵消大腿前屈对后片的错误牵引，保持后片沿臀后到椅座外缘，而不是让后片随大腿卷进座面。所有目标都是装备局部配置，不写人体骨或根位移。
3. 这六骨均直接挂 UpperLeg，没有纵向弯曲链，不能表达大腿顶面到侧缘的曲率。若实测六骨单独不足，限定**一份该装备作者坐姿 corrective morph**处理下摆曲率/内折边，源中保存真正顶点位移和零位边界。它由实际屈髋角平滑启用，不按动作墙钟突切；站、坐入、坐稳、起身/取消同一连续权重，无额外动作时长或逐帧点 guide，也不宣称物理布料。
4. 首件只做一次真实坐稳作者姿态及中间态检查：完整 body/top/chair、内搭、自交、连缝与真实手皮肤；随后同镜头 1× 坐起/中断、走跑和代表舞。必须保持两 primitive 全点手前/最终面一致；坐稳合格不能推广到中途或非对称腿姿态。若一份 corrective 无法覆盖，先报告具体失败，不自动增加姿态库/控制骨/余量。

这份方案的主要风险是原作者权重的 hips 残留与六骨扇区混合会限制局部弯曲，前后片转动可能拉扯接缝或自交；需要实际源制作验证，不可仅用 skeleton 屏幕看起来转动来宣布解决。


## 可恢复的隔离运行入口

```powershell
cd prototype
npm ci --ignore-scripts --no-audit --no-fund
npm run build -- --outDir ../dist-v4-rebuild
cd ..
$env:QA_RUNTIME_ROOT='F:/gamemake'
$env:QA_M1_BUILD='17034f3fffc1'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_MOVIE_ONLY='1'
node scripts/run-fixed-check.cjs dist-v4-rebuild scripts/m1-assets/simple-skirt/qa-v4-diagnostic.cjs
```

工具根仅用锁一致 Playwright 依赖；干净检出已 npm ci 时可指本检出。重建应核实际 build-info，不能把其他源码改动仍标17034。取消 QA_MOVIE_ONLY 会启用重读回，不能同时拿该片做无观察开销性能。QA_LIVE_ONLY=1 为离线步进 speaking ON/OFF 验证，不冒称正常1×片。临时 server 生命周期随脚本结束。

运行差分仅 `prototype/src/simple-skirt-adapter.js`、`prototype/src/m1-equipment.js` 的 opt-in 装备分支、`prototype/index.html` 诊断横幅和 `prototype/public/assets/simple-skirt-v4/`；不复制 main/foundation/motion。原分支仍 createM1Skirt。上游 a1 的 bodydebug 修正未在本 aed 派生分支内，后续只做局部集成。
