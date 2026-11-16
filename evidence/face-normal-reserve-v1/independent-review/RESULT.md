# 13526ff 零 NORMAL 布局独立审查

结论：当前精确原女/原男输入未发现阻止隔离 GPU 对照的源码或数学问题；不等于同意合入或证明实际性能改善。发现一项内存口径遗漏，见下。未运行浏览器、Blender、GPU 或广泛矩阵，未修改产品。

审查提交 `13526ff9800f52a3096d2fb8dc0c2345be8a9d86`，基底 `0137d7e94be80bff15ae391f54e3c31a259babeb`。helper/facial/host SHA 分别为 `d795099cce507626941d326df5765e6e985537c054ed18eff52bb42696322041` / `c453e4d37e721f8479ea0acc5d2c0a35bf2354d687b6e11f183f9ae2876f2503` / `03b2f577f1dae742c8c0b1b4ef1ee733112588814caa5fcc876d7496aa6859cf`。原 RESULT 的“未提交/未构建”是较早记录，不能用作当前构建状态；本审查以提交和文件 SHA 为准。

## 实质发现：眉单项持有额外零数组

`facial-geometry.js` 的 brow-only 路径不重算法线。真实 `BufferGeometry.clone()` 会给每个 morph normal 分配独立数组，而 `normalSet` 为 null，不会替换它们。因此女眉 clone 的 56 个零数组共 **1,380,960 bytes**、男 54 个共 **1,332,288 bytes** 在眉样件生效期间常驻；不能把所有新增 clone NORMAL 成本仅写为临时分配。这是现候选取舍/报告问题，不是已证泄漏。最小独立 CPU 检查 `check.mjs` / `check.json` 已实际执行：男女各一个眉 clone；reset 各 dispose 一次，随后 API dispose 不重复释放此 clone；另一 actor 源零数组未变。

原报告对每 geometry morph texture 的 CPU backing/GPU 基础存储分别计算是正确口径，4096 上限跨行填充也符合当前 Three 实现。额外常驻需与“原几何仍保留 + 当前编辑 clone 的纹理/属性 + prepareRender 的临时对象”区分；不能把六几何表当整 actor 峰值或实际 VRAM。JavaScript 容器、驱动副本/对齐和 shader program 成本尚未实测，原报告已承认该边界。

## 通过的只读边界

- `foundation-avatar` 在文件 SHA 校验、GLTF/VRM 解析与 rotate 后、root 加入 scene 前调用。该同步区间没有 await/render；失败走 deepDispose 并抛错。未知派生不套预留。后续配方、位置、形态与法线校验没有取消，资源 SHA 未伪装为新文件。
- helper 对全部目标先验证再赋值，拒绝已有 NORMAL、混合材料或异常布局；只新增 `morphAttributes.normal`，不改原 attributes、position morph、索引、绑定或 influence。重复调用不重新分配。首次渲染前这一约束必须保留：Three 的 morph texture 缓存只看 target count，不看 stride。
- WeakMap 只按原 geometry 记录本 actor 新建的 targets key；每次 reserve 调用独立分配。当前 loader 每 actor 独立解析；最小实证确认同 actor 共享、跨 actor key/buffer 不共享。cache key 合并的前提是原 base normal 逐值相同、全部新增 delta 为零；apply 的 normalSets 仍是一次 apply 内局部 Map，不跨 actor/请求。零数组是约定不可变而非 JS 强制冻结，后续功能不得直接写这些原数组或复用已渲染 geometry 改布局。
- 原 clone/reset/失败清理路径仍保留。Three 用每 geometry 的 dispose 事件释放其 morph texture；零 BufferAttribute 本身不拥有单独 GPU buffer。当前新增弱引用不构成独立强持有 actor 的全局表。最小 CPU 门只证对象引用/事件，不证 renderer/driver 内存最终回收。

## 数学证据与限制

已读真实 GLTFLoader 的男女 16/15 个 expression-manager 对照脚本和报告：其验证实际 binding dictionary/influences、源属性与 POSITION morph，以及新 NORMAL 均为 +0；纹理解码被 stub，不是 GPU 检验。对 relative morph，Three/MToon 的 normal chunk 为原法线乘 1 加有限权重的零 delta，因此当前合法表达输入支持数学不变。原 27 组 CPU 对照还覆盖四域组合、完整各 shape 输出和 jaw 不预留分支，允许的“缺失 normal 等价零”规范化明确，并非原 GPU 布局字节相等。

这不能证明不同 shader variant 的 GPU 像素逐位一致、实际首帧无异常、driver 内存预算或持续 shader 取样成本。新增非零表达时 normal texel 读取、初始化填充/上传及编辑 clone 纹理仍可能抵消首改收益。由 prototype 的唯一 GPU 对照裁决，不追加本审查的大矩阵。

复跑最小检查：在仓库根目录执行 `node evidence/face-normal-reserve-v1/independent-review/check.mjs`。该脚本明确依赖上述隔离树现有文件/锁定依赖，仅使用真实源数组 fixture 和实际 helper/facial API，不冒充完整渲染器生命周期。
