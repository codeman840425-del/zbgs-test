# main接缝与真实QA独立审查

本轮复用已知显式请求配置gpt-6.1-sol/high，难度complex。理由为独立核对共享接缝和真实控制器验收条件，排除假通过及夹具误判。实际provider配置与桌面Hook拦截未独立验证。

审查为只读源码检查，未启动浏览器、GPU或服务，未修改main、QA或room模块，未提交Git。输入文件SHA及逐项依据见seam-qa-review.json。既有CPU报告的三份输入SHA与作者最终文件一致。

main相对af47的变更保持既有floor/wall/chair引用，并保留角色控制器、导航执行、任务和占用实现。legacy-calibrated执行旧开场Z校准，layout-owned保留配置位置，随后仍调用原refreshChair。未发现本次最小接缝的必改产品问题。

QA有一项明确需修正的判定及一项证据范围约束。

- qa-room.cjs第124行的actual exit releases只要求done(primary-stand)及锁释放。done包含failed/cancelled，需同时断言任务state为completed。正常1×段的runTask已经要求completed，此漏洞位于独立生命周期段。
- 第92行只检查sitProgress与骨盆椅局部X/Z。数值结论限于坐稳状态与平面覆盖，实际座面接触高度没有在该判定中测量。可收窄数值结论，若宣称真实接触通过，则补相应独立高度或接触证据并观看影片。

已审查的合理部分包括构建/人物SHA身份校验、四条正常1×运行链、实际鼠标地面点击后到达、忙碌变换拒绝保原、真实双实例争用与预约取消。生命周期直接调用现有simulate，主实例在同一dt中更新peer；该段与正常速度录像分开记录。现有finally负责关闭本脚本创建的上下文、浏览器和随机端口服务。

本审查未执行这些浏览器步骤，源码条件合理性不代表本轮真实运行通过。
