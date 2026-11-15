# 1a附件错误状态与真实房间输入隔离

**通过：原男体当前固定1a0d06fc8ffe，仅一条受影响用户路径，19项检查。**

实际公开4191，正文首尾均核runtime/served固定身份及男体真实资源SHA。1440×900 headed Chrome；不改shared产品源码，不录屏/计性能，不重复派生或race矩阵。

用户路径：真实按钮装备眼镜 → 对male profile注入一次明确503 → 错误提示持续 → 在提示区域真实滚轮 → 真实按钮重试 → 实际点击地面。

## 实际结果

- 侧栏阶段共有112个逐帧只读样本，root、idle、target、path、任务active/pending/history、相机position/target严格相同；三个阶段边界相机quaternion也相同。没有用“事件target不是canvas”代替状态检查。
- 错误仍明确为503，无加载附件；轮子delta−120使侧栏scrollTop **1014→894**，所以不只是发送无效wheel。实际wheel target是DIV，composedPath经SECTION/ASIDE，无CANVAS，isTrusted=true。
- 重试后提示清空，requested/loaded=true，真实traverse只有一个眼镜附件。
- 随后一次真实canvas pointerdown/up/click，全部isTrusted=true且target=CANVAS。只产生一条walk命令，目标 **[0.9900797020, 1.7992703899]**，与屏幕投影所选地面[1,1.8]相差约9.95mm（像素取整）。真实path/target成立，root由[-0.5,0,1.15]移到[-0.49037814015958653, 0, 1.1541925198242693]，距离 **10.496mm** 后结束采样。不是通过禁用canvas输入获得前段不动。
- 末尾仍只有一个拟合眼镜，零pageerror。

只读QA记录document原生事件（target/composedPath/isTrusted）、rAF状态，以及保留原this/参数/返回值的command观察包装。不dispatch DOM事件，不调用go/walk伪造正例，不每帧回写camera/pose，不放宽原UI相等门。

## 首轮失败必须保留

第一次脚本真实点击“房间全景”后仅等0.2秒，产品原生cameraTween为0.5秒。基线误取在[2.704,2.681,5.534]，下一采样自然过渡至接近[5.8,4.5,7.8]，因此相机门失败；人物/路径不变，未证实UI穿透。已按实际源码确认原因。

只修改QA等待真实camera目标到位、再等100ms取基线；没有停止/覆盖相机动画或改变状态相等门。原第一轮报告、错误截图、当次脚本在initial-setup-failure，最终报告在final。旧175/abdb/13f证据没有改标。

## 边界与复跑

只覆盖当前原男体新错误布局这一短路径；不代表真实后台恢复、OS窗口最小化、长时间持续可靠性、所有UI拖动或目标普通电脑已通过。未出现需要修改产品的真实输入缺陷。

```powershell
$env:QA_M1_BUILD='1a0d06fc8ffe'
$env:QA_M1_RUN_ROOT='output/playwright/m1/1a0d06fc8ffe/accessory-ui-room-isolation-next'
node scripts/qa-accessory-ui-room-isolation.cjs http://127.0.0.1:4191/
```

输出路径必须全新。浏览器已关闭，公开服务未改。
