# abdb 实际标签页后台验证

固定 `abdb18defd26`，Playwright **1.58.2** + 本机 headed Chrome。一次真实第二标签页切换成功观察到原生 `visibilitychange`（`isTrusted=true`）隐藏/恢复，7项检查通过、0 pageerror。证据：`evidence/native-background-abdb18defd26/actual-tab-report.json`，源与工具 SHA 在 `receipt.json`。本轮不改运行时。

## 为什么旧检查没有隐藏

本地 Playwright `crPage.js:412` 在每个主 FrameSession 的 `_client` 初始化时发送 `Emulation.setFocusEmulationEnabled({enabled:true})`。旧 `qa-native-background.cjs` 用 `context.newCDPSession(page)` 建立另一个会话并发送false；它并未向原来启用覆盖的主会话撤销。旧三个真实最小化日志依然如实保留hidden=false，不能改成通过。

新脚本 `scripts/qa-native-background-primary-session.cjs` 依据锁定版 `inProcessFactory.js:48` 的本地 `connection.toImpl` 与 `server/page.js:95` 的 `delegate`，取得同一个 `delegate._mainFrameSession._client`，向该会话发送false。随后对真实第二页也撤销其测试focus覆盖，并调用真实 `bringToFront` 切换标签页。不覆盖document.hidden，不dispatch事件，不使用生命周期freeze来冒充隐藏。

第一次脚本错用 `_delegate`，在发CDP指令前assert失败；保留 `initial-harness-error.json`。按本地源码修正为 `delegate` 后执行同一方案，成功报告原目录为 `output/playwright/m1/abdb18defd26/native-background-primary-session-1794704285281`。不是修改游戏以使测试通过。

## 实际结果与边界

真实隐藏事件发生于页面wall 2309.3ms，恢复于3654.6ms，约 **1.3453秒**。两事件的simulationTime均为 **0.451秒**；隐藏期间两个独立采样也保持该值，`backgroundSuspended=true`。返回后该标记false、仿真继续推进，300ms观测窗口内没有把后台时长补算进去。首尾实际build/body SHA一致。

结论仅覆盖该构建、该环境下的**真实标签页隐藏→恢复短路径**。未复测OS窗口最小化，未做长后台/休眠/断网/目标普通电脑验证。原显式暂停测试与此独立。私有Playwright接口有版本断言；未来升级必须重新核对，不能无条件复用。

复跑需独占浏览器并指定固定版本/原女性身体SHA，使用既有run-fixed-check临时服务；脚本每次新输出目录，退出关闭浏览器和临时服务。本轮没有录屏、性能采样或全链重跑。
