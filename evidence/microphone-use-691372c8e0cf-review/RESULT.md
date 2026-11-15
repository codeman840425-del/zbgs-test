# 691 carry腕折独立只读复核

已看真正男女carry/talk前侧8张原图。carry侧图显示前臂向前下、手掌在腕处折向前上；talk侧图腕到掌基本延续前臂。不能从9–16度就宣布talk自然通过，但两者几何差异可见。未修改产品、未新开浏览器。

## 原因

离线用原VRM rightHand→rightMiddleProximal及精确grip挂点反变换，男女掌长轴在麦克风坐标均严格[1,0,0]，与shaft +Y=90度，详见grip-axis-proof.json。

microphoneArmTarget四次细化把forearm方向作为side，再由microphoneHandTarget投影到shaftY垂面作micX。这个roll策略只能选绕Y的角度；若前臂单位向量f与固定shaft y的点积不为0，最佳投影仍有最小夹角 asin(abs(f·y))。所以轴向不兼容不能靠更多roll迭代修掉。

carry固定capsule目标在chest+[-.16,-.06,.18]，固定shaft[.12,.82,-.56]。实际女腕比tip低150.3mm，男低145.9mm；这种低腕/前伸目标和肘下方pole使前臂向前下，而shaft向上后。掌轴受刚性握姿约束要垂直shaft，形成可见折腕。报告所有carry reachClamped=false、actualWrist与desiredWrist一致，不能归为够不到或IK截断。talk高目标让前臂向前上、与对口shaft近正交，同roll方法才有效。

没有证据表明左右轴反了：同raw→normalized转换与刚性grip在talk得到顺接。也不应首先把肘pole反到身体后上来凑腕角；这会改变肘姿但不保证解决固定capsule+shaft约束的矛盾。

## 一个有界建议

非讲话carry没有“麦头精确瞄口”的任务，优先让手腕自然：只在carry分支选胸/腰前的腕目标，用现两骨IK和现肘pole，再用**源静止手相对前臂的旋转**保持中立腕；麦克风随既有精确grip挂点走。carryTip可以作为位置参考而不硬锁方向。talk分支继续用现真实嘴点/capsule瞄准；沿现talkHoldWeight过渡两种目标。不要用world identity手旋转，也不改指姿/grip绑定。

先核原女carry前侧以及carry↔talk连续；若麦头因此指向胸/脸或进入身体，则调整该小范围carry腕目标，而不是复活全局roll扫描。这里是建议，不是已实现/通过。完整掌柄接触仍只有有限顶点圆柱probe，不从0穿入推定任意三角或自然握持。
