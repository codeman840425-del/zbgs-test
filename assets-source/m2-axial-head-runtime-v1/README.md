# 连续轴向男性头部候选接入准备

此包登记 `male-long-lean-axial-head-v1`，显示名为“瘦长脸·仅头部候选”。只应用原四个头部请求。原六个修订成功预设、两个失败预设及八个初版预设保持身份和含义。当前包状态为待 root 固定构建和实际游戏验收。

## 重建与 CPU 检查

在仓库根目录执行以下命令。

```powershell
python -B scripts/m2-axial-head-runtime-v1/prepare.py
python -B scripts/m2-axial-head-runtime-v1/qa.py
```

输入由 `spec.json` 精确固定，包括原男 VRM、新导出 VRM、装备/fit/forearm、原配色 manifest、独立导出/混合表情审查和注册模块的 `source-base/` 原字节快照。快照来自提交 `a5815585928edc47baf8af9ea6e110873ea12e12`，逐文件核原 SHA 后保存，原路径和提交记录在 spec。这样集成后的注册文件不会反过来阻止本包重建。缺失或 SHA 不符会在写输出前失败。默认产物在本目录 `generated-v2/`。已有相同输出直接返回，已有不同输出拒绝并保留。`--out` 只允许本包内的新子目录。中断留下的部分 stage 也会拒绝覆盖，可保留后选择新输出目录。

`qa-result-v2.json` 记录 CPU 检查。真实模块 fixture 导入原 foundation/profile/palette 代码和原 JSON，确认原 14 个预设、20 个 profile 和全部原配色版本一致。新候选仅提供 outfit 0 长裤与 outfit 2 短裤。错误 SHA 和缺失源的负例保存在 `qa-negative/`。首轮 `generated/`、`qa-result.json`、`spec-v1.json`、`package-files-v1.json` 保留。v2 只修复生成输入和发布计划元数据，13 个 public 资源及补丁与首轮逐字节相同。

## root 应用

`generated-v2/publish-plan.json` 给出 13 个实际资源的逐文件目标路径、SHA 和长度。其 `runtimeTargets` 显式记录真实 runtime 目标路径、预期修改前和修改后 SHA、原字节快照。将 `generated-v2/public/assets/` 下两个新目录完整复制至固定检出的 `prototype/public/assets/`。复制时保持 forearm 子目录结构。

对照输入基线后应用两文件补丁。

```powershell
git apply --check assets-source/m2-axial-head-runtime-v1/generated-v2/integration.patch
git apply assets-source/m2-axial-head-runtime-v1/generated-v2/integration.patch
```

补丁只增加 `representative-batch.js` 的独立 JSON 登记及 `eye-blink-compatibility.js` 的新精确 SHA。生成器只写本包，不直接应用补丁或写共享 public。root 负责确切集成提交、独立检出构建和现有房间/工作台验收。检查区的证据链接可使用 runtime index 的 `reviewUrl`。

## 资源依据与限制

新 VRM SHA 为 `83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9`。原皮肤、头发配色沿既有机制。虹膜/外唇使用单独的新 SHA 配色 manifest，生成时实际核原材质、图像和 15 个 primitive UV 完全一致，并核既有 mask/neutral 资源 SHA。

上衣实际随新 G 适配。裤、短裤和鞋与原装备字节一致。forearm 使用新身体 SHA 的真实 profile。实际 1795 个受髋/腿骨影响且被 Body_SKIN 引用的顶点及其权重、完整骨架/skin 保持一致，为保留原 3.6 mm 坐姿值提供源依据。坐姿实际接触仍待验。sourceFloorY 保持原 0，原鞋最低点 0.494728 mm 单独记录。

仅登记原发型，未登记替换发型、无发 base、外套、帽、麦克风或局部五官配方。没有继承旧身体 coverage 或未适配装备。

眨眼登记是新 SHA 的诊断候选。原 EYE_Joy/Close 字节等同路径没有用于证明此新源。独立离线十组合中，happy .65 + blink 1 + oh .66 存在新增 mouth128–skin1020 一对，原计数 8 变为 9。该已知缺陷保存在实际登记和 evidence 中。真实 manager、闭眼覆盖、法线光照、发根、正常说话和完整动作均交由 root 房间 QA。CPU 检查不构成视觉或运行验收。
