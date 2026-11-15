# 175 连续用户链：相机与资源离线核查

先分析固定 `175a487d5ea3` 已录数据，再在负责人授权窗口追加一次同版原生输入隔离短检查；没有性能测量或运行时代码变更。输入、SHA、相邻帧和计数详见 `evidence/user-chain-175-camera-resources/analysis.json`。重算：`python scripts/audit-user-chain-camera-resources.py`，需要原 `output/playwright/m1/175a487d5ea3/final-user-02/03` 报告；紧凑结果可独立查阅。

## 相机：缩放特征已确认，输入来源未确认

女性裙第 26.1234 秒首次变化时，位置相对 target `[0,.65,0]` 的三个分量均乘 `0.95`；男性短裤第 32.2932 秒均乘 `1/0.95`。固定包内 `_getZoomScale` 使用 `pow(.95, zoomSpeed*abs(delta*.01))`，dolly 分别乘/除该比例。此证据符合 OrbitControls 缩放；后续还发生角度变化。原日志未采 pointer/wheel/composedPath/isTrusted，**不能由比例认定具体输入设备、操作者或 UI 穿透错误**。

实际实现中 `room` 是房间预设，不是锁定镜头。`main.js` 的 `cameraPreset()` 仅对 front/side/back 禁用 controls；room 的目标固定、OrbitControls 仍可更新。只有 close 模式自动跟随角色。固定包的房间设置片段已在 JSON 留证，不把当前工作树当作 175 源快照。可读源位置：`main.js:393,759,1224,1373,1391`；OrbitControls `connect():495` 仅将 pointerdown/wheel 接到 canvas，普通 sidebar 按钮不是 canvas 的 DOM 子节点。Phaser 地面点击另有 `event.target===canvas` 与拖距判定（`main.js:722`）。目前未找到支持“侧栏按钮自身传播到 OrbitControls”的具体代码链。

`qa-m1-user-chain.cjs:31` 仅开头四次换装用真实 click，后续用任务/命令 API，没有后段 wheel 或 mouse 调用。女首次变化靠近 reference-loop/cancel 标记，男附近没有命令；时序相近不能证明因果。原两片保留为真实操作记录，但不能称全程严格同外参。

最小下一核查：在 QA 层记录 canvas/document 的 wheel、pointerdown/move/up（target、composedPath、isTrusted、delta、时间）、OrbitControls start/change/end；分别只点侧栏与明确操作 canvas，比较相机变化。这是待执行方案。若目标是旧新严格同镜头录像，应使用显式 QA 固定镜头并逐帧断言外参，不应仅把 room 预设当锁定，也不应无证据禁用产品合法观察操作。

### 补充：实际原生输入隔离已执行

`scripts/qa-ui-camera-isolation.cjs` 通过固定版本及真实身体 SHA gate，使用 headed Chrome 原生输入，不合成 DOM 事件、不在录制中回写姿态/相机。6 项检查通过、0 pageerror；报告保存 `evidence/user-chain-175-camera-resources/native-input-check.json`（原目录 `output/playwright/m1/175a487d5ea3/ui-camera-isolation-1794703340841`）。

- 侧栏真实换裙点击成功；后续 wheel `+100` 的实际 target 为 `P#foundation-legend`、composedPath 经 ASIDE，无 CANVAS，`isTrusted=true`。相机、根位置、idle 和任务历史不变。
- canvas 的 wheel `-100` target/path 经过 `CANVAS > #phaser-stage`，`isTrusted=true`，产生精确 `0.95` 缩放，不启动房间行走。
- 所有事件与逐帧相机保留。初始设置 room 后没有强制相机回写。未复现输入隔离错误，不建议据旧轨迹修改产品监听器。该有界结果不覆盖所有 UI/拖动组合，也不能识别历史两次输入来源。

以后正常录制应增加只读原生事件记录和逐帧外参不变 gate；检测失败保留原轨迹，不每帧纠正相机来隐藏变化。本次未重录全链。

时间边界注意：rAF 参数是帧时间戳，可能略早于该帧内已处理的输入事件。此次缩放后的首帧 rAF 时间为 2910.8ms，wheel 捕获 `performance.now()` 为 2911ms；不可仅用这两个时钟值切割而把正常 canvas 缩放归到 UI 阶段。未来 gate 应记录回调实际采样时间与显式测试阶段。本次 UI 结论来自 canvas 操作前已完成的独立状态采样，事件来源完整保留。

## 资源：一次阶跃，尚无逐轮残留证据

|循环|主服装|加载 peer 前|加载后|销毁后|销毁减少 geometry/texture|
|---|---|---|---|---|---|
|0|裤|88/44|103/80|88/44|15/36|
|1|首次显示裙|88/44|104/82|89/45|15/37|
|2|裤|89/45|104/81|89/45|15/36|

最后再运行 20 秒仍 89/45，peer=false。第一次裙装的 before 是同步 setOutfit 后立即采样，尚未保证经历渲染帧，因此不能把其 88/44 视作裙装渲染后的完整基线。

源机制与该结果一致：`createM1Equipment` 预加载所有服装，切换只改 container.visible；`createM1Skirt` 克隆一份实际显示 geometry/material，原裙 mesh 隐藏，主裙保留供下次换装使用。Three `WebGLGeometries.get` 首次注册 geometry 才增加计数；`WebGLTextures.initTexture` 首次建立 WebGLTexture 才增加计数。未显示的裙可以已在 JS 内存而尚未计入 renderer。销毁整个装备时 skirtCorrective.dispose 与 adapter.dispose 分别释放派生几何和原资源。

因此一次 +1/+1 **高度符合主裙首次渲染后保留的资源分配**，现有记录不支持“每次 peer 销毁都遗留 +1/+1”。但没有按资源 UUID 记录 GPU 初始化/释放，不能将确切归属写为直接观测，更不能宣称无泄漏；3 轮/20 秒也不是长期测试，renderer counter 不等于资源字节数或全部 CPU/GPU 内存。

最小下一核查：主角色所有服装各渲染至少两帧后记 warm baseline，再重复同类型 peer/服装循环，比较销毁后平台值并保留按资源身份的创建/销毁记录。完整页面/主角色 teardown 独立验证。无需因本次单次阶跃立即修改生产缓存/销毁策略。

本报告补充 `docs/M1-FINAL-USER-QA.md` 的未归因条目，不改变该链的服装几何失败、观感待审、后台和目标设备限制；后台的后续 OS 最小化实验由主负责人另记。
