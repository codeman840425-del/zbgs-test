# a344 移动反馈试验：定向回归

试验构建 `a344b8a7203c`，独立 `experiments/iris-soft-movement-trial-v3/dist` 临时服务。公开4196保持旧版。8项程序门通过，0pageerror；已实际逐张查看8张完整1600×1000截图。没有录像/性能/动作自然度验收。

实际通过范围：默认脸近景未命中后持续提示650ms以上；顶部房间移动入口切room并同步URL/按钮，随后真实地面点击推进；速度仅选择并提示目的地，三tab/速度按钮不产生walk且不移动根；reset保留半身侧面与URL、速度恢复.85；暂停中路线不推进且明确提示继续，继续后根真实推进；换男保持同document并可跑路线；坐稳点地面显示起身提示并起身移动；真实danceMix>.9后点地面退出舞并移动。各门保留before/after/实际command，运动门等真实位移>0.1m而非只判断mode。

**截图审查额外发现仍需处理的反馈过期：**`5-pause-route-and-resume-sync.png` 已恢复、按钮为“暂停”、人物正在移动，顶部仍写“路线已选，当前暂停；点击‘继续’开始移动”。程序门验证的是暂停时正确及恢复后运动，未断言恢复后的状态文案，因此不能以8门通过掩盖此项。已通知root，建议恢复时按当前有效目标/路线更新提示。未修改试验源或回写原报告。

`7-sit-then-floor-stand-walk.png`在起身已结束开始行走后仍保留“起身后移动”的请求回执；此处不将其误作当前状态证明。底部实际状态为行走。其余截图未见本次新增入口遮挡或UI叠层吞输入。

测试浏览器、临时server均已关闭。待最终版再录正常1×短片；本包不作为发布身份、已完成自然度或最终文案全通过。

```powershell
node scripts/run-fixed-check.cjs experiments/iris-soft-movement-trial-v3/dist scripts/qa-workbench-movement-feedback.cjs evidence/new-unique-output a344b8a7203c
```
