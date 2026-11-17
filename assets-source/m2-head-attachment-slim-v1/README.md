# 原男附件语义 SLIM 单次试验

本包只进行新的语义附着合同试验，保旧固定眼发试验及失败。原域5742节点/37114tet、原embedding/23native目标和两原请求不变。没有重做八人物、没有runtime/public/catalog写入，未提交主树。

## 分类与前置

精确material表在spec.json和preflight/classification.json。EyeIris、EyeHighlight、EyeWhite所有base+54原morph端点以及neck保留保护，8frame不动。HairBack、Eyeline、Eyelash、EyeExtra沿同一G(P+D)作依赖适配，未修改眼骨或分类为独立rigid。

旧4447 protected改为1343，释放3104 adaptive，保留/适配共坐标0。每请求1374软控制、4368free。原source/endpoint坐标逐值验证后精确对应native nodes，遗漏、重复坐标或重复b目标冲突即拒绝。同坐标固定类保护优先规则保留并报告。skin/mouth/brow的非native morph点继续用原Qhull序embedding，不冒称每点都是domain node。

全部3791个四角都受控的tet，以真实目标重算J，lean最小.617432135905、round.857874662318，没有<=.12。这个前置只检查完全受控tet，没有据此推定自由tet或soft求解通过。

源码复用只通过固定旧evaluate AST，两处差异为新报告schema和fixed-eye/fixed-neck端点筛选。evaluate-adapter.diff可直接检查。原函数/旧spec/旧失败没有改写。np.generic.item序列化复用已回归helper，并在execution-prepared中再次固定实际bool/int回归。新execution receipt只列确切消费文件，不glob无关脚本。

## 唯一实际执行

实际命令只执行一次

```powershell
python -B scripts/m2-head-attachment-slim-v1/run.py --execute-once
```

原native identity一迭代，全5742节点误差0m、113713端点最大1.1641716839774582e-15m。通过后，lean/round各从原域起步，官方SYMMETRIC_DIRICHLET、soft_p=1e5、固定20步一次。没有改变迭代/权重/密度、没有重试。

总墙时16.577319秒，采样递归进程树峰RSS1007165440B，exit0，无预算停止。2线程，600s/3GiB限制。50ms采样共享页可能重复计数，不能当瞬时精确峰值。

| 请求 | 最小tet det | fixed端点最大偏移mm | adaptive端点最大位移mm | Float32实际半宽最大误差mm | 缺段 | 状态 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| male-long-lean | .223621099931 | .000024058 | 8.276850 | 9.379861 | 0 | failed-not-admissible |
| male-round-stocky | .206279531683 | .000397729 | 13.618857 | 2.638866 | 0 | failed-not-admissible |

原det>.12、固定眼/neck/frame2um、finite、模拟Float32 morph bake2um均通过。Float32端点bake最大误差分别.118208/.117267um。两项唯一剩余数值失败是原101实际horizontal半宽2mm门。lean最差第64截面请求半宽43.882138mm、实际53.262000mm；round第30截面请求53.580943mm、实际56.219810mm。实际切面和Float64辅助数组原样保存，不把23guide残差替代截面门。

只有已测门可报告通过。没有数值候选，因此没有运行后验strict/表达检查，没有导出VRM或提交游戏验证。修正保护分类改善了所测J/固定点结果，尚未实现两个原轮廓请求，不能称通用脸型/附件适配完成。

## 可读合同与资源

- method spec SHA `59b34c062163b39e1d1b92bfb35ae12c3f7efcc7fa01b71e62efc96124f83f16`。
- execution spec SHA `96d47ced7f6f422d018f2c4755b80b30cc44d1d906862d2bbe27f0df32165d26`。
- closure.json汇总结果/最差切面/初末独立能量/过程回执，所有pin执行后回核不变。
- generated各case/report.json schema为semantic-head-attachment-slim-result-v1，id为male-*-attachment-slim-v1，sourceRequestId保原-v2，methodId/spec/classification/source/endpoint-records均精确绑定。
- generated各case的solved-nodes.npz和mapped-endpoints.npz保真实节点与全部原端点、Float32拟bake、J/det。端点顺序仍依原domain的endpoint-records.json offsets/sourceIndices，embedding仅用原Qhull顶点序及barycentric。
- fixedEndpointRoleMeaning只包含fixed-eye/fixed-neck。adaptiveEndpointMaximumDisplacementsM单列，不拿附件的非零位移充当保护通过。

后续仍需真实发根附着、眼白覆盖、闭眼/嘴牙与原表达关系、原三角strict、真实VRM法线/skin/IBM/UV/image导出、衣物与游戏验收。旧试验和根因证据保持，待root决定下一窄包，不由本包扩变量。

本包code是可编辑的离线技术源，官方core及原角色许可沿已有tool/source记录。该结果没有额外模型、训练、收费依赖或浏览器运行。
