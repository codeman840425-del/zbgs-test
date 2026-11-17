# 当前角色基础工程恢复点

## 版本与入口
- 项目 F:/gamemake，分支 feat/m1-foundation-room。4196公开仍987294fd778d，源码3baf747c；delivery/appearance-workbench.json为准。4174历史媒体，4195封存M1。
- 最新已核远端994b06ce；本地候选提交82df559e（眼镜）与e7999bec（原生握麦/30秒转换）尚未备份核验。公司副总工dirty文件不stage。
- 固定眼镜候选b552a60da1f9：experiments/native-glasses-fixed-v1/prototype/dist。
- 固定整合候选a3781e8afe1c：experiments/native-features-fixed-v1/prototype/dist，源码e7999bec。尚未替换4196，男性拇指局部问题在收尾。

## 当前优先包：原生候选旧功能接入
- 用户报原生女/改脸/男麦克风和眼镜不可用，native-capability-gap-987-v1已实际复现；不是仅贴图皮肤，新完整VRoid身体来源不同，但未补齐共用生产适配是工程缺口。
- 眼镜四源登记和数据生产已在82df完成；235 CPU检查与独审保留。四源b552真实按钮、快速装卸、暂停恢复、12秒近景1×和各约35秒房间链技术通过。evidence/native-glasses-{female,male,face,waist}-room-v1、native-glasses-workbench-b552-v1。耳冠0.1–0.7mm有限穿越仍有，正常近景未见严重裂面，女性刘海遮挡/局部镜腿露点保留；不是zero-contact/人工自然度通过。
- 原生握麦纠正VRM1 thumb canonical被VRM0 alias覆盖。四source实际Three/VRM15指骨回读过；female face/waist的手部几何/权重/相关18骨bind/rest等价后复用女手，mouth各自测。a378四源近景实际装卸讲话/携带/暂停过，男女走坐起持麦房间1×过技术门。evidence/native-live-workbench-a378-v1、native-mic-{female,male}-room-a378-v1。
- 男性v1 thumb合成握柄圆柱6.2mm/13点接触缺陷；v2声称锁v1实际锁默认初值且3轴按bone被覆盖，root拒绝。http_transport_review正在保留v2失败并按真实v1参数/逐轴转换做v3，不能采纳v2零交叉结果。未经真实运行不发布v3。
- 原30秒舞封存资源不改。四native由留存授权FBX重新做目标转换generated-v2，旧来源许可不扩大。a378独立native-rokoko-5359146-30s-v2已加载；root正在scripts/qa-native-30s-workbench.cjs串行4源完整1×+退出任务测试，路径点(-1.8,1.0)走入后真实guard准入。evidence/native-30s-workbench-a378-v1。非旧舞新优化；接触/视觉仍待独立判断。
- QA脚本初稿错误已root纠正：不占桌面、走前解除暂停、录制早于舞蹈起步、真实UI、真实任务ID、空间边界。检查实际最终report，不凭中途影片宣告4源过。

## 并行与接续
- http_transport_review：known requested gpt-6.1-sol/high，male thumb v3源数据；不GPU/src/public。
- native_glasses_review：known requested sol/high，已修D01 source/store并发基本回归；现在只读审真实record接入/props遗漏与stale-lock暂停接管风险。D01未集成，不称游戏记录完成。
- asset_budget：known requested sol/high，native motion转换/stage/QA准备完成；root接管GPU。stage失败注入证明manifest保原/新dest回滚。
- GPU/录屏串行，无桌面接管。agent实际provider与hook拦截未独立证实；派工记录evidence/subagent-explicit-dispatch-2026-11-16.json。
- 完成新源props/dance固定版和4196入口后接续完整M2，首选独立稳定记录的真实游戏消费/恢复。所有能力事实写CAPABILITIES，不将单包完成等同长目标完成。

## 持续边界
- 封板女裙与旧30秒舞不重开。普通电脑无设备，开发机不能冒认目标实测。
- 原生头发落座外扬、原白衬衫/肤色层次低、基础人体非完整链、全部速度/衣发/参数组合未通过；原生其他颜色/附件/几何仍按实际query准入，不继承旧体通过。
- 源工程及脚本、确切提交独立构建、旧失败证据保留；禁止git add -A。M3/服务器不展开。
