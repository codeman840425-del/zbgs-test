# 四项渲染缺陷定向复核

继续已知显式请求配置gpt-6.1-sol/high，任务难度complex。仅复核四个原失败与直接受影响的显式discard、无关屏幕状态编辑，6项全部通过，初始失败证据initial-report.json未改。

- 场景dispose后，未提交候选47个geometry与47个material全部收到dispose，未释放计数为0。
- 递归资源后续子节点失败时，本轮已创建的4个geometry与4个material全部清理，有效场景保持原样。
- 同revision恢复后旧候选提交返回revision-conflict，屏幕2恢复的关闭状态保留。
- 合法存档省略空chair.state后，忙碌空状态编辑保留相同chairSeat引用，旧geometry的dispose事件为0。
- 显式discard仍完整释放候选并拒绝后续提交。无关屏幕变更保持两组占用座面引用。

复跑命令为node evidence/company-c1-render-independent-v1/reproduce.mjs --recheck。输入SHA、实际Three释放计数和逐项结果见recheck.json。

本轮未修改产品、提交Git、运行浏览器/GPU或重跑无关范围。结论限于CPU资源和引用生命周期，未建立真实角色或WebGL画面通过。实际provider配置与桌面Hook拦截仍未独立验证。
