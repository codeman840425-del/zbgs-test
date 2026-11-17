# 当前角色基础工程恢复点

## 版本与入口
- 项目 F:/gamemake，分支 feat/m1-foundation-room。4196固定公开 build07bab15f3382/source06c416b3e0c99c00d328516c01d90045b4b07b7e；delivery/appearance-workbench.json为准。4174历史媒体，4195封存M1。
- 本次 git ls-remote 已核远端等于06c416b3；当前发布指针及最终live检查随后提交备份。公司副总工dirty文件不stage。
- 固定树 experiments/native-feature-release-fixed-v1/prototype/dist；前版987指针保留于delivery/history。观看 /?workbench=appearance 与 /native-production.html#native-features。

## 刚完成：原生候选旧功能接入
- 旧987四native缺mic/glasses注册已真实复现；不是仅贴图皮肤，新完整VRoid身体来源不同，但未补齐共用生产适配是工程缺口，不能要求用户逐项发现。
- 四源女843ac/脸cc0843/腰cf1574/男7586已实际装卸眼镜、麦克风并完成讲话、持麦走坐起及30秒舞。四源影片有原始build身份，不改标签。发布07b仅比实录c64改观看HTML，runtime/resources逐文件相同。
- 最新live evidence/native-feature-live-07b-v1：原female和四native均mic/glasses on、loaded，cases.errors空，build均07b。UI evidence/native-feature-release-ui-07b-v1包含22媒体实际播放/解码、男女/三女性与原色准入/换装检查。
- 眼镜耳冠女≤0.678mm/男≤0.183mm有限交叉与刘海局部镜腿露点保留；不是零碰撞或人工自然度通过。b552四源房间/近景影片与独审保留。
- 握麦生产修正VRM1 canonical thumb被VRM0 alias覆盖。female face/waist手部几何/权重/相关bind/rest等价后复用握姿，mouth分别测量。male v1拇指问题及被拒v2保留；v3真实锁非thumb，只调拇指，已实际c64近景/完整持麦房间链复查。零圆柱采样不等于完整碰撞或自然度通过。
- 原封存30秒舞不改。留存FBX独立转四native目标generated-v2，a378四源完整1×30秒、退出任务技术通过，真实房间空间guard未绕过。源手臂/衣物局部接触、发动态、脚底仍保留；旧体人工接受不继承。元数据旧sourceRestSpace措辞错误仍有，实际按源hips94与目标米制比例。

## 当前主工作包与并行
- 接续M2 D01完整独立角色记录及保存恢复；旧appearance recipe不含live麦克风/眼镜，不能按先配方后道具的部分成功伪称整套原子恢复。
- live_prop_transaction：显式requested gpt-6.1-sol/xhigh/fork none，complex，修改live-presentation.js及自身测试，实现prepare/validateCommit/commit/release，失败/过期保当前道具。agent仍在做；其dirty源码未进入07b固定发布。
- D01 character-record/store源实现及并发测试尚未集成。Windows锁已改fail-closed，不按mtime夺锁；等待超时store-busy。需要补整套实际资源身份和共用游戏准入/恢复，不能相信调用者随填resourceIdentities。
- root整合并审实际用户路径；GPU/录屏串行，无桌面接管。agent实际provider与hook拦截未独立证实；记录evidence/subagent-explicit-dispatch-2026-11-16.json。

## 边界与下一步
- CAPABILITIES为唯一能力事实。完成单包不等于M2完成，依完整v2继续，M3未授权。
- 原生其他配色/发型/附件/参数仍按query真实准入，不能声称新体全部旧功能恢复。头发落座外扬、白衬衫肤色层次、基础全链/所有速度组合与普通机未验保留。
- 女裙与旧30秒舞封板不重开；普通电脑无设备，开发机不冒认目标实测。固定提交构建、保原失败证据、禁止git add -A，不stage公司资料。
