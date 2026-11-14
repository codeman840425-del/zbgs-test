# 单次招手独立接入候选

基于 `af1367583ce8d82d4986fe1e02373e2ea2263d03`，分支 `feat/m1c-greeting`，工作区 `experiments/m1c-gesture-worktree`。独立提交 `8b2a9d8357974113c7cd422273f54e49c8fb91d0` 完成后，已按负责人指令将限定文件差异集成主工作区；没有执行 cherry-pick、提交主分支或发布。源模型已经离线检查，目标男女 VRM 的完整正常速度观感、袖口与面部遮挡仍未浏览器验收，不更新为能力通过。

## 接入范围

新增 `prototype/src/greeting-layer.js`，由每实例 `live-presentation.js` 创建和释放。源码 GLB 懒加载，1,566,668 字节及 SHA256 `eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06` 强校验，无失败替代动作。解析后的源模型立即释放，只保留当前实例的重定向采样器。

复用现有 `motion-source.js` 的 rest-world quaternion 转换规范（含源左右髋朝向和 VRM0 基变换），只取 18 个 normalized 左臂/手指旋转。目标 rest 在 avatar 创建时捕获，不在播放请求时误捕当前坐姿。源的 201 全身常量通道不会覆盖根/脚/髋/右臂。更新顺序保持 motion authored pose/接触 → live.preUpdate 招手/表情/持麦 → vrm.update → live.postUpdate raw 挂点。

2.8 秒播放时间包含开始与结束各 0.2 秒的权重渐变。普通取消冻结当前动作采样时刻，0.2 秒向每帧底层 authored pose 退出；新行走/起身等任务在该退出结束后执行。reset/dispose 属显式状态重置，可立即终止。暂停只传统一模拟 dt，不使用墙钟定时器。

稳定 idle（无路径/转向/排队过渡、gait<.01、stopTime≥.5）或 sitProgress 严格等于 1 的坐稳状态允许。走跑、舞蹈、坐起中过渡、已请求持麦均拒绝；右手持麦层仍有退出权重时，live 层再次拒绝。招手活动期间也禁止装备麦克风，两个指令同 tick 不会穿透。路线/自动序列明确拒绝，避免绕开退出协议。暂未开放招手+持麦或舞蹈组合。

`main.js` 只新增 task admission/完成/退出等待和一个 UI 按钮及状态文字；未改变转向、路径、足锁、座椅或布料算法。特殊取消保持当前稳定坐姿和 seat lease，不会因取消招手自动起身。

## 统一入口和结果

```js
// 和走路等行为相同的入口；不能直接当完成结果使用 admission。
const admission = __debug.command({
  type: 'action', name: 'greeting', requestId: 'qa:greeting:1'
});
__debug.tasks().get(admission.task.requestId); // running → completed / failed / cancelled
__debug.tasks().cancel(admission.task.requestId);
__debug.avatar().livePresentation.getState().greeting;
```

`getState().greeting` 有 id、requestId、status、time、weight、duration、sha256、error。只有同 requestId 且 layer 到 `completed` 时任务才完成；资源失败和 timeout 返回 failed。重复相同 requestId 或按钮重复点击不重启；活动时另一个新 greeting requestId 拒绝 busy。旧 fetch/parse/callback 有版本与任务身份检查，不能复活或覆盖新请求。二实例各自拥有状态、采样器与加载控制器。

## 已执行的检查及边界

```powershell
node scripts/m1c/qa-greeting-layer.mjs
node scripts/m1c/qa-greeting-controller.mjs
node scripts/qa-behavior-tasks.mjs
cd prototype
npm ci --ignore-scripts --offline
npm run build
```

Layer 测试使用真实固定 GLB 和 GLTFLoader：hash、18 骨转换、排除右手/髋、二实例、暂停、重复请求、完整终点、0.2 秒取消、HTTP/hash 错误、fetch 取消、parse 途中 dispose 后源网格释放。Controller 测试执行实际 CharacterScene 方法，使用明确的移动/加载测试替身：统一指令/完成身份、稳定坐姿、坐入 .99 拒绝、取消不自动站、连续替换任务延后执行、timeout、旧失败回调隔离。

这些是有针对性的源码/状态回归，不是浏览器任务链、目标身体适配或视觉通过。首个中间构建成功（`dcfc7abcd0b9`），之后只补 admission/状态显示与对应 Node 回归；负责人录制期间不再次编译，最终集成须重新生成 build ID 并在固定版本进行男女站/坐完整 2.8 秒、取消、暂停、双实例与资源失败实际验证。源制作复建说明见 `assets-source/m1c-gesture/README.md`。

## 主工作区集成记录

限定 main/live 两个既有文件采用提交差异检查后 apply；新文件按提交路径白名单复制。同名 untracked 源资产逐项比对后保留，只有 README 两处状态说明更新，原件备份在 `output/greeting-integration/source-README-before.md`。没有改 motion.js、turn-policy.js 或其他脏文件；负责人同期仍在修改 motion.js。完整预检、变更白名单与 Node 结果在 `output/greeting-integration/{preflight,integration-report}.json`。主区复跑 layer 7 项、实际 controller 9 项、原 behavior/seat 7 项均通过。集成后未构建、未开启浏览器；前述中间构建 ID 不能标为当前产品版本。
