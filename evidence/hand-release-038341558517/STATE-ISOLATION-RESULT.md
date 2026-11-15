# 038 handRelease 跨帧/双实例状态窄验

最终执行证据：`state-isolation-seeded/report.json`，固定038341558517、两份分别解析的原女性精确身体。12项检查全部通过、pageerror0。只用既有公开debug、raw手腕、handContacts及其releaseSeed；没有加入产品debug或读写私有state。为确定性隔离关闭二级动态，不能外推春骨/普通PC或全几何。

## 跨帧裙→裤→裙

- t4.700：裙装已有左右投影11.9009/24.1526mm、释放seed9.6994/21.6839mm。
- t4.708333和4.716667：裤装实际推进两个tick，contacts为空。不是同tick脱穿。
- t4.725：换回裙装再推进实际tick，两手releaseSeed均0，当前新投影5.1882/22.9277mm。同姿显式关闭/开启修正的冷解与回裙实际腕差严格0；与脱裙前旧world腕最大差24.7319mm，未复用旧世界目标。
- 冷解对照后再推进两个真实tick，t4.741667两手seed为4.8265/19.8565mm、投影6.9615/22.6507mm。后续双实例检查是在这个确有非零释放历史的A上进行。

## 实例隔离

第二原女性B使用独立avatar、VRM、motion。A暂停并保留上述实际避让/历史；B实际进入技术舞并产生非零投影，再跨实际tick切裤清理自己contacts、换回裙并变为idle。全过程A的时钟、根位置、raw腕与全部非计时handContacts字段严格不变。A随后一个实际tick与没有B的同一重放对照严格相同，腕差0。比较只排除fitElapsedMs/timing测量字段，不排除接触、seed、目标或投影。

不是资源生命周期测试，也不是同屏碰撞/全动作验收；B移除后实例接口为空，Chrome和临时HTTP服务均已关闭。

## 保留的QA失败与补强

初版`state-isolation/failure.json`及failed-script.cjs保留：同一页面reset后复用原requestId，任务去重返回先前completed，第二次setup未真正跑动，随后“必须有非零避让”前置条件失败。不是产品漏清release。修正只让不同setup用唯一requestId，未改产品/门槛。

随后`state-isolation-final`12项通过，但其A刚做冷解，seed仍0，只证明当前投影隔离，不足证明非零历史隔离；preseed-script.cjs和原report均保留。最终脚本增加两个实际tick重新建立非零seed，明确前置断言后才执行同一小验，没有新增矩阵或放宽门。权威结果是state-isolation-seeded。

```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-hand-release-state-isolation.cjs 038341558517 <新目录>
```

可新检出5f4250a构建prototype/dist并替换dist路径；脚本不依赖忽略worktree。最终批次冻结，没有进一步检查计划。
