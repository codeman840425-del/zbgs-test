# 77 既有女性两派生当前代表链

固定 `77e46efb5441`，两片各只录一次、串行、正常1×；没有改产品/服装/人体或CAP。观看入口 [index.html](index.html)。本轮补当前组合的连续执行证据，不代替精细接触和用户自然度验收。

## 身份与允许范围

录制前重新核匹配源 `experiments/rebuild-77e46-e94ac1c/prototype` 全输入摘要等于固定dist，从该原profile取各自SHA，不冒充原女性：

- jaw：`3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011`，自己4件装备与`m1a-jaw-v1-uniform-skirt-pose-guide-v1`。
- waist：`10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5`，自己4件装备与`m1a-waisthip-v1-uniform-skirt-pose-guide-v1`。

实际读取的各装备SHA/字节/body pin已验证，三次UI换装均核实际visible ID与专属裙fit。两者仍是自己的742点旧裙；没有强装原女682点open-waist、coverage或别人的fit。现有技术舞 `dance-technical-once-v1` 为UAL通用骨架7.2秒技术编排，两者实际准入并完成；没有normalized/Rokoko片、mic或glasses。

## 执行结果及原QA失败

每体9个任务：前两次walk/run因明确重选而cancelled；重选停步、裤装坐/起、裙装坐/起、到舞空间、技术舞共7个completed。均final idle、活动任务空、outfit0、0pageerror、room相机采样不变；runMix实际>.95。无中途reset/传送/固定步推进/暂停。

- waist：26/26现脚本检查通过。
- jaw：实际全片已录完，25项通过，最后`real outfit clicks`旧QA失败。真实event.target为按钮内`B`，旧采集仅读target.dataset，漏记祖先button的outfit。原报告/原片/失败文件全部保留，未改成全绿、未重录jaw。离线 `adjudicate-jaw-clicks.py` 用3个trusted click严格落在对应UI请求和实际outfit验证之间、逐次visible资源ID一致，确认是QA事件定位错误，非产品换装失败。更正仅使用closest按钮及显式body筛选，再跑尚未执行的waist；完整diff归档。

| 身份 | post-ready采样帧 | wall秒 / simulation秒 | 技术舞任务含进出秒 | 最大rAF间隔 |
|---|---:|---|---:|---:|
| jaw |5090|31.7897 /31.7872|8.0717|60.8ms|
| waist |4810|31.7655 /31.7636|8.0700|60.7ms|

两个采样窗口sim/wall约.99992/.99994，非完整原片时长。原片保留加载页（waist初始化短暂close）；开始正常链后room固定。记录时长/间隔只用于本片时钟与帧尾说明，不是普通PC性能基准。原jaw因最后QA断言尚未写clock，summary仅从其未变原始rows重算，明确来源。

## 完整时段工程抽审

已逐张看12张2fps图，jaw71/waist70采样，覆盖完整原片，不只选好看的画面。两者约2–5.5秒走跑重选、7–12秒到椅、12.5–14秒裤坐稳/14–15秒起身；15–15.5秒换裙，15.5–17.5秒裙坐稳/18秒起身；19–23秒裙行走；25–31秒技术舞；33秒左右回裤。

采样未确认新增明显肢体脱离/倒置或顺序异常。裙坐姿前片硬折/较平的衣面仍可见，是当前冻结形态限制，未修也不将此包称整裙无缺陷。约10秒和30.5秒全房间包括家具一起变糊，作为清晰度限制保留。人物room尺寸小且间隔.5秒，不能排除更短跳变、微小手/身体穿插、脚滑；抽帧不是1×连续人工观感通过。

没有重测表情、旧源码生产/全皮肤矩阵，不能把038有限门自动升级为所有动作精细接触通过。用户接受77男女基础不等于接受这两派生的新观看结果。普通电脑仍未测。

## 复跑

```powershell
$env:QA_M1_BUILD='77e46efb5441'
$env:QA_M1_RUN_ROOT='F:/gamemake/output/playwright/m1-variants-current-77e46efb5441-rerun'
node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-variant-chain.cjs
```

当前QA修正只针对click祖先定位，可选`--bodies=m1a-jaw-v1`或`--bodies=m1a-waisthip-v1`，未知/重复身份拒绝。历史jaw/waist各自实际脚本、原始报告无损gzip、轻量trace/fit/任务/源manifest、完整影片及hash均归档。浏览器和临时服务已关闭，未提交。
