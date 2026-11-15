# 真实后台仍未证实

abdb18defd26，headed Chrome的实际原生窗口最小化返回windowState=minimized，但页面仍hidden=false、没有真实visibilitychange，仿真仍推进。三份有界诊断分别为默认Playwright、移除其强制focus仿真、再移除三个后台禁用启动参数；均未伪造document.hidden或visibilitychange。当前环境无法借这些操作证明真实后台路径，**未通过/未验证**，不能用noCatchup=true（页面从未真隐藏）声称后台恢复通过。

已保留原报告；不为追求通过更改游戏暂停逻辑。显式暂停、resize、有限反复使用属于175其他检查，有独立范围。
