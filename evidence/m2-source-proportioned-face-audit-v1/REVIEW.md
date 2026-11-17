# 新来源比例脸型的独立导出与 strict 读回

新候选 `5120bd32b3491864d216f5a93810829f8f128f974a79824b3c911f62fa0810e5` 的一次原 55 单表达和 10 组合 strict 检查已完成，新增交对均为 0。该结论只对应这份新导出、原粗拓扑、原冻结谓词和本次权重，不代表所有组合、视觉、动作或生产准入。

输入 spec SHA 为 `daa6dcd1d7eb7f0652bdbd50b1f27562bec1e977c0491f1bb0719d33f2ad33c5`，原男源 SHA 为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。本审查没有修改候选、求 G、扫描参数、生成新 VRM、运行浏览器或使用旧 fine/inclusive 合同。requested 配置沿已记录 gpt-6.1-sol/high，实际 provider/hook 未独立核验。

## 实际导出身份

`attributes.json` 记录全部 15 个 primitive 消费者。2 个共享 POSITION 组及实际 120935 个 base/原 morph 端点读回一致，501 个 consumer/endpoint 的实际 POSITION/NORMAL 组件均核对。54 个真实面部 target 名称、原粗 indices、skin 的原 JOINTS/WEIGHTS、IBM、nodes、UV、材质、贴图图像、原表达绑定 JSON 保持。新增 NORMAL delta 不能省略。

原作者 N 按这份冻结 raw 的实际 J 逆转置传输，并按原 policy 生成 base/endpoint NORMAL delta。实际导出组件与预期 Float32 组件完全一致，最大组件差为 0。此项是导出与已存 J 的读回，未重新证明新曲线全部实数域导数。最大 POSITION bake 误差为 1.4612012766e-8 m。

完整 raw 的全部源端点 Y/Z 与原值完全一致，实际导出全部 54 target 的 Y/Z delta 组件以及 Float32 单态 Y/Z 也完全一致。原 FaceMouth 最低 Y 到 Face_SKIN 最低 Y 的 neutral proxy 为 0.0324550867081 m，新候选相同，ratio 为 1。该 proxy 仅说明这项原 Y 比例保持，不是所有头脸比例或观感已经通过，也不意味着完成旧 lean 的 13 参数请求。

## 一次 55 与 10

原 source 55 基线通过固定 `source-male.json` 引用、原文件 SHA 和 canonical pair SHA 核实。原 `contacts` / `segment_hits` 的资源与 AST 身份固定，阈值未变。新导出每个原 target 单态均由其实际 Float32 base 加实际 Float32 delta，然后转 Float64 送入原 strict。只查询 FaceMouth–Face_SKIN。

10 组合沿原清单，neutral、happy-open、neutral-closed、happy-half-blink、happy-full-blink，以及 happy .65 + blink 1 + 五元音各 .66。source 和 candidate 都使用相同的 corrected 材质角色及负 EYE_Joy `−happy×blink`。混合是原顺序对实际 Float32 buffer 的 Float64 加权和，没有声称与 GPU 算术逐位相同。mouth-skin 和三组眼部关系分别保 source/candidate/added/removed 的完整原三角对。

`single55/` 和 `mixed10/` 保存每态完整结果，`progress.json` 保存完成过程，`result.json` 汇总 55/55、10/10、新增均为 0。原眼部接触并非零，现有对保留。例如 happy .65/blink 1/oh .66 的 mouth-skin 为 source 8、新候选 8，white-skin 8、white-eyeline 38、white-eyelash 24。这些数值没有被写成覆盖、闭眼或视觉通过。

原被拒绝 83f 头部样件的 known-oh 新增 pair `[128,1020]` 另作一次局部 witness。`known-oh-witness.json` 保原 source IDs、source/new/rejected 三组实际坐标及本次原谓词结果。新候选与原 source 的该局部 strict hit 都为 false，该组点 Y/Z 差为 0。旧 83f 的已存 hit 保留为对照，没有重新求旧 G 或重跑 55/10。新候选是不同的请求与资源，不能以此改写旧 83f 失败，也不能概括为任意口型穿插已解决。交对是否命中与视觉穿透深度分别处理。

## 运行边界与失败保留

真正 55+10 worker 约 19.51 秒，带监控总时长约 19.70 秒，采样递归进程树峰值 120692736 bytes，最大预算 600 秒/3 GiB，2 线程环境变量，未触发预算。100 ms 采样不是瞬时峰值，也不是普通电脑性能。

最初 monitor 在冻结数值解释器下缺 psutil，发生在 child 启动前。改由已有 system Python 监控、冻结解释器执行 worker。其后一次 helper 的相对 import 路径缺失，发生在任何 contact state 前，失败脚本、日志、pins 和回执完整保存在 `pre-contact-import-failure/`。补正确模块路径后才执行唯一一次实际 55+10 遍历，没有以重跑失败 contact 的方式覆盖结果。

本审查只视读 root 已有 source/rejected/new 的 front/side 共 6 张实际材质静帧，没有据其宣布严格同相机比较或用户观感通过。静态 overlay 不是正式 profile 接入，原相机差异记录也不因此失效。真实 manager、正常速度眨眼/讲话、动作、共用装备/发型/饰品适配和保存恢复均未由本包验证。不继承旧 83f fit，不代表原八体完成。

全部输出和实际输入的 SHA 见 `package-files.json` 与各结果 pins。封包后停止，不继续扫描或修改样件。root 负责后续同相机实际观看和下一包决定。
