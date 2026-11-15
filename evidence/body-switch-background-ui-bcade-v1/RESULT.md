# 换人准备中真实切后台：限定回归

固定4196，bcade40d24f1，源码c222404；Chrome独立headed profile，1440×900，Playwright1.58.2。使用真实女性/男性按钮，实际compileAsync完成后由测试钩子暂缓提交，切换到另一真实标签页，后台释放提交，再切回。没有合成visibility事件，没有产品代码改动。

23项技术断言通过，0页面错误。两例分别为行走女→男、暂停男→女；隐藏约1.504/1.510秒，隐藏模拟时间增量均为0。隐藏提交保留最新位置与模拟时间，返回后前例推进约0.569秒，后例保持暂停。旧walk任务取消，UI选中组和URL都匹配实际人物，同一document持续存在。恢复截图已经查看，仅用于身份/界面状态，不能证明连续动作自然度。

仅两次短标签页切换，不含操作系统最小化、长时间休眠、设备丢失、完整坐姿/服装动态矩阵、性能或新视觉接受。此前aa后台与77失败仍保留原版本身份。

前置诊断命令路径保存在相邻body-switch-background-bcade-v1，19项通过；其__debug命令不触发工作台DOM同步，截图按钮不作为UI证据。本包实际UI路径补查该范围；没有为获得通过修改产品。

复跑（新输出目录，拒绝覆盖）：

```powershell
node scripts/qa-body-switch-background.cjs http://127.0.0.1:4196/ bcade40d24f1 evidence/body-switch-background-ui-rerun --ui
```

脚本、原始状态/可信事件/每帧采样、恢复截图随包保存；浏览器已关闭。chrome-profile仅本地忽略，不纳入远端备份。无录屏、无性能结论，现有正常速度换人对照继续使用body-switch-compile-browser-bcade-v1。
