# 90297751ab35 独立审查与干净重建

**状态处理审查无阻断；干净重建通过；UI布局未通过，不能称最终公开UI全部通过。**

审查固定提交 `2b16b40e743768f830b250099ef3556e9f63a6d0`。该提交的prototype产品差异只有main.js附件按钮约20行；没有人体、动作、附件loader、几何、API命令改动。审查源码及保留的真实按钮报告/截图，未启动浏览器、未重跑动作、未改源码。

## 状态逻辑

- 每个附件按钮单独`uiRequest`，只允许最新调用写错误提示/按钮文字；不同附件互不抢序号。
- `await emit`周围捕获拒绝；原`command`与`setAccessory`仍返回原applied/reason/cancelled或reject。没有把不兼容附件改成成功或改loader清理。
- 独立`role=status`不再被每帧scene-state刷新清掉；错误后按钮按真实requested恢复，重试时旧错误变为加载状态，成功/明确取消后清除。
- 支持快速加载→取消→再加载，不关闭可取消按钮；旧异步回调的catch/finally都受同一序号守卫。
- 在这些真实按钮路径未发现新的遗留状态。程序直接改附件与按钮标签的全局同步不是这20行新增能力，不作无范围的“所有UI状态永远同步”声明。

## 已有实际测试证据复核

`evidence/accessory-ui-90297751ab35/before/`实际13f两派生+male503各有1个未处理拒绝；after902三项均0pageerror，持久错误存在。男性503恢复后重试成功，快速取消再装旧请求完成后slot仍on/requested=true、notice空。

有两个必须保留的边界：

1. `rapid.mounted`使用`scene.children`统计，但附件在后代节点，成功时记录0。脚本没有断言该字段。不能用它证明“无重复挂载”；其他slot/失败无残留/卸装断言有效。负责人将后续改真实traverse，旧证据不改写。
2. 亲看保留的before/after截图：debug-row无换行，既有按钮竖排；新长status又占横向空间，使错误提示与按钮难读。状态已持久显示不等于可用布局通过。负责人已接独立最小换行修复；902保留为历史中间候选。

## 全新检出重建

- 新detached sparse worktree：`experiments/accessory-ui-fresh-2b16b40`，完整prototype及根配置；安装前无node_modules/dist。
- `npm ci`锁文件安装 exit0，约5.33秒；`npm run build` exit0，约4.35秒。
- Node v24.13.0、npm 11.6.2、当前Windows 11开发机。
- build-info完整一致：`90297751ab35cc83b577fd54652d98bcc313bf865dbffd14fb0e8275b37ae6d5`。
- 固定对照`experiments/m1-accessory-ui-1/dist`未改。新产物完整 **63文件 / 125,721,402 bytes**，路径/大小/SHA全部一致；缺失0、额外0、差异0。构建前后Git clean。
- 源build-id不含Git元信息，没有伪造版本。原有大bundle警告保留，不当成失败或性能通过。

复跑（新路径必须不存在）：

```powershell
python scripts/qa-fixed-rebuild.py --commit 2b16b40e743768f830b250099ef3556e9f63a6d0 --baseline experiments/m1-accessory-ui-1/dist --worktree experiments/accessory-ui-recheck --output evidence/accessory-ui-recheck
```

完整产物清单、输入SHA、命令和耗时见report.json；原安装/构建日志及所审main局部diff保留。本次没有浏览器/录屏/全动作，不能替代新布局候选的专项UI检查。完成UTC `2026-11-15T03:35:02Z`，此后未继续重跑。
