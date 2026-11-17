# 原男轴向函数系数前置

本包只完成identity及原male-long-lean-v2、male-round-stocky-v2三组头部函数的系数前置。实际只施加jawWidth/cheekWidth/chinLengthM/chinProjectionM四参数，metadata中的其他身体参数仅保原请求溯源，未施加身体体型变形，不能称完整lean/stocky人物。每组PchipInterpolator构造一次，共三次，无knots/强度/保护域扫描。没有完整source/morph求值、mesh/人物导出、runtime/public修改或旧tet包改写，未提交主树。

## 固定输入和表示

原男SHA62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff，head原点沿精确原source。局部G为x'=s(u)x、u'=u+dY(u)、z'=z+h(u)，外段u<=L或u>=U显式identity。L=-.09536004066467285，U=.04140663146972656，来自完整fixed-neck/eye原端点域；frameLow/High为-.113015193939209/.22421552658081056。

共同knots来自已审600tri带全部363source顶点Y、原101sourceY和四guard的精确并集，原468条来源合成347个uniqueY、346段，没有近邻合并。每组重复Y目标一致性独立核验，无平均或clamp。Head.fit仅目标段AST复用，生成s/dY/h标量。四guard取1/0/0；原23/101目标及参数不改。

调用真实已装SciPy1.18.1 PchipInterpolator(knots,values,axis=0,extrapolate=False)，NumPy2.4.2。source/spec/tool SHA在spec.json，执行后全部回核不变。源码、工具和原角色许可沿既有记录，未引入新资产。

## 实际前置结果

唯一执行1.2759172秒，采样递归进程树峰RSS107876352B，2线程/600s/3GiB，exit0，无重试。原四个精确验证回归涵盖常值、端点高但内部失败、细分后可证及预算耗尽拒绝。

| 系数case | exact证书s下界近似 | exact证书q下界近似 | 最大C0差 | 最大C1差 |
| --- | ---: | ---: | ---: | ---: |
| identity | 1 | 1 | 0 | 0 |
| male-long-lean-v2 | .669216168566 | .393862433830 | 9.2083e-17 | 4.0243e-15 |
| male-round-stocky-v2 | 约1 | .976210641755 | 1.7081e-17 | 4.8911e-15 |

q=s*(1+dY')。round的s exact下界略小于1约1.38e-17，显示为1只是Float64近似，完整分数在proof中；证书要求是s>0，未宣称s>=1。全部case平台系数精确constant。数值C0<=1e-11、C1<=1e-8的已声明precision guards均过，s值/导数单位为dimensionless及m^-1，dY/h为m及dimensionless，逐分量左右差保存在proof.seams。

每case覆盖346段的s及q，共692个visited区间，均直接证过，没有细分或预算未证。代码保有限de Casteljau depth12/4096总visited上限，未证会拒绝。

原23/202标记点函数读回最大误差不超过2.222e-16m，原101各scalar误差0。original-request-readback.json另外直接对原不可变23/202目标核验，原式AST与原保存目标逐坐标差0，保存系数的函数残差仍为舍入量；该补核只用PPoly，未再次构造PCHIP。

状态仅为coefficient-preflight-passed-pending-geometry。

## 三种证据的边界

1. bernstein-proof.json把**实际保存Float64系数**转成精确IEEE二进制有理数，按exact相邻knot差归一化，得到s三次、q至多五次。每段精确Bernstein凸包下界严格大于0/3/25。approximate字段仅显示，判断只用Fraction；低阶检查不是几何优化器。
2. 接缝是存储实多项式左右值/导数的精确差再与声明的数值precision guard比较，包含舍入级非零差。不能因此声称实函数严格全域C1或严格全局单射。
3. 官方BPoly/roots为非认证cross-check，proof与case报告明确floatingExecutionWholeDomainBoundEstablished=false。当前只读过23/202/101标记，不是全部浮点执行域/实际mesh的2um或2mm通过。

旧tet失败事实保持，新函数表示没有把原tet门改标通过。完整原GLB Body/Hair还有旧113713记录未覆盖的实际引用点；后续须遍历全部实际POSITION及各原morph/accessor或逐点证明外段identity，不能沿用旧记录声称全模型已验。

## 可消费数据和重现

- generated/common-knots.json保所有Float64 knots、逐条source来源、四guard、head原点及原目标AST。
- 每case/curves.json保Float64 knotValues和PPoly.c，顺序为c[k,segment,component]*(u-x_segment)^(3-k)，components=[s,dY,h]。
- 每case/bernstein-proof.json保实际curves SHA、全部原beta、叶区间/深度/界/阈值和全部接缝。与curves精确配对读取。
- 每case/report.json保原23/202/101残差、平台、precision guard和非认证cross-check。
- closure.json汇总三case SHA和过程，source/research/版本身份在spec。

```powershell
python -B scripts/m2-axial-shape-function-v1/run.py
```

该命令已执行一次，当前目录存在会拒绝覆盖。未来重演需独立精确检出/输出身份及固定工具，不能为了更好结果在本目录反复运行。跨平台逐字节确定性未证明。

下一步只能在独审系数后由root另授权完整原端点G求值、Float32实际101、固定2um、真正G Jacobian>.12和原表达strict门。不得由本系数前置直接导出、发布或声称游戏完成。
