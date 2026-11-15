# Query bounds真实输入可行性研究

基底提交5f4250a3ce5d958de16d31ba3ce9a8724cea28a8，独立导出prototype后先计算原build038341558517。只读捕获钩子形成诊断build24b5754965ef；未改变原query/interval/alpha/求解结果。主线prototype/src未写。

九个真实1/120秒姿态：站立、2.4跑三时刻、坐入两时刻、坐稳、起身两时刻。原女性专属裙和profile、动态/修正全开。捕获每次原grid全部3D三角点、二维projection、clip constants，以及每条rail的真实cell候选顺序和全部原nonnull区间。不是只有旧880条rail摘要。

|姿态|候选|原nonnull|可排原null|占全部|
|---|---:|---:|---:|---:|
|standing|29442|6193|19129|64.97%|
|run-96|12528|1862|8760|69.92%|
|run-160|13868|2070|9874|71.20%|
|run-240|7144|834|5332|74.64%|
|sit-enter-early|21171|3230|15184|71.72%|
|sit-enter-late|34969|5077|25958|74.23%|
|sit-hold|47923|6971|34889|72.80%|
|rise-early|25589|4023|18089|70.69%|
|rise-late|20203|3366|14071|69.65%|

总8160条rail / 212837候选；179211原null，其中151286可排（全部71.08%，原null84.42%）。33626原nonnull全部保留、其lo/hi/start/end逐数严格相同；重新用原workspace从3D点build也得到相同二维值、clip常量及候选原顺序。没有容差比较，不放宽原1e-9/1e-12窄相位规则。

纯离线研究筛选：二维AABB严格分离且间隙超过1e-6m+64*EPS*maxAbs才拒绝。有限域内坐标/clip常量绝对值≤100、三角投影span在[1e-6,10]、rail span≤10、abs(den)>max(1e-12,span²*1e-6)；域外、非有限、退化/近退化全部回旧narrowphase。实际九姿均在域内。已做touch、submicron gap、separated、degenerate、nonfinite、extreme、ill-conditioned反例。

这不是任意极端输入的形式化证明，也不是运行性能收益。预筛本身有成本，不能将候选减少71%换算成CPU减少71%；nonnull仍保留全5样本，query及其他阶段也仍有成本。分布支持下一个限定运行候选，但此包本身没有任何runtime剪枝、视觉通过或普通PC结论。顾问后台两线程编码可并存，本次是数值诊断不测性能。

完整输入capture/fixture.json.gz、报告distribution.json、离线重放replay.mjs、源patch及精确base/candidate motion均已保留。所有Chrome/临时服务关闭。

复算（依赖repo prototype已npm ci，Three版本由锁文件固定）：`node evidence/contact-query-bounds-study-v1/replay.mjs`。无需活动worktree；原workspace helper已自包含保存为forearm-contact-workspace.original.mjs。

可重建诊断：`python evidence/contact-query-bounds-study-v1/prepare-isolated.py <fresh-isolated-dir>` →在其prototype目录npm ci、npm run build；然后 `node scripts/run-fixed-check.cjs <fresh-isolated-dir>/prototype/dist evidence/contact-query-bounds-study-v1/capture.cjs <fresh-output>`。恢复脚本先校验038与原motion字节SHA，再装只读钩子并校验24b。

初次构建前本地脚本cwd引用错误导致先重建了一次未插桩038（保留源身份，非诊断结果）；改为根工作区执行安装后才捕获24b。本包实际输出身份以capture内双gate为准。