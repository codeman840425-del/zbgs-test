# 新原生男女双实例实际运行

固定源码 b27eb47bf57df0058d210318e521e7751fde60e3，build **193bbbf64323**，目录 experiments/native-pair-fixed-v1/prototype/dist。实际主实例女843ac、comparison男7586；两VRM从浏览器重新fetch计算SHA全等，未借旧角色。使用原loadComparison/共用factory/Phaser时钟，没有改生产源码、4196、Studio或封存动作。

本包结论是**已观察到代表性隔离，整套脚本末段断言未通过**。两份原始report均保持failed，不能把它们标成整套通过；readback-summary.json只逐项整理实际证据。

第二轮 rerun-v2 的97个250ms采样中57个为双实例，24.29秒1×录像。已证：

- 实际骨对象130/79、skeleton6/5、材料25/24、geometry17/16、纹理74/70、morph数组8/8，全部交集0，配置对象独立。首轮旧QA枚举Object.values(material)漏掉MToon getter，texture count0为空测；第二轮显式读map/shade及其他实际纹理属性，不能用首轮0计数证明纹理隔离。
- 暂停时A基础皮肤/表情/动作命令不改B骨架、表情、装备、Body map，反向亦然。1×时A基础模式happy+dance，B维持dressed/neutral/idle；随后B基础模式aa+walk，A恢复dressed/neutral/idle。Body maps全采样无交集；六根代表normalized骨数值均finite。
- A取得同一椅预约并实际sitProgress=1，B同时sit明确seat-unavailable。只验证该预约互斥，不证明不同体型任意椅fit/双人避碰。
- 销毁B瞬间A完整采样前后全等，主材料/geometry/texture无dispose事件；comparison清空、B离场、A仍挂场。随后A真实stand→walk到约[-.484,0,2.195]→idle，证明销毁后继续运行。全程浏览器错误0。

失败边界：首轮在椅边起身后直接要求dance，脚本期望dance而实际idle。第二轮显式任务读到该位置的 **insufficient-dance-space** 拒绝；之后正常walk到另一点，再次附加dance仍idle，脚本末尾再次断言失败。第二次dance的任务reason没有采集，不能武断称同因，更不能称跳舞完成。没有第三次扫位置或追加录像。旧末段checkpoint名称“female-running-after-disposal”只是标签，实际action=idle；销毁后继续运行的依据为stand/walk采样，不是该标签。

录像：首轮 failure-partial-1x.webm（18.89s），第二轮 rerun-v2/failure-partial-1x.webm（24.29s）。两者均原速，无剪辑/加速；截图pair-loaded、female-base-male-dressed、seat-conflict及failure保留。已看静态截图，两实例和衣装变化可见；脸部、轮廓、接触、服装视觉验收留后续独立包。

开发机滚动frameMs末段约mean6.07/p956.20ms，双实例与销毁后均有原值；不是稳定benchmark，也不是普通电脑达标。无显卡型号读回或人群容量结论。

复现入口 scripts/qa-native-pair-isolation.cjs，只提供已释放的临时随机HTTP和自有Chrome，不触碰4196；新输出目录参数可传。当前脚本保留末段真实失败断言，重跑并不保证通过。CPU重读 `python evidence/native-pair-isolation-193b-v1/readback.py` 不启动浏览器。已关闭两次自有浏览器和临时HTTP，GPU窗口已向root明确释放。无Git提交。
