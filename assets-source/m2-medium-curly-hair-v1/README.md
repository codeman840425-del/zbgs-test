# 中长卷束失败样件

原男 `62b44b…` 的完整发帽保留，新增28条实际封口卷束。两组参数分别改变长度、卷曲半径和圈数。单个刚性mesh复用现有头部挂接与原男HAIR材质，身体与头脸均保留。最下端在头局部y约−99/−69mm，属于耳侧至下颌和后颈的刚性候选。动态、动作接触和实际观感由固定游戏构建验收。

两款造型已由用户质疑并经root拒绝，失败原因包括粗绳状、折线和不合适的束分布。停止派生fit扩产及进一步采样。`FAILED-STYLE.json`记录成本、限制和源身份。

封存的最终低采样产物位于 `budget/<style>/`，高采样在 `corrected/<style>/`，`generated/` 和 `attempts/` 保留初次源和失败包络。初次侧束太靠前，唯一修正将侧弧收至105度并读取真实head-only皮肤包络。修正实现曾错误纳入T-pose手臂，异常宽度源保留于 `attempts/failed-arm-envelope`。变量名遮蔽的两个执行错误发生在产物写入前，记录于制作回执。

```powershell
python -B scripts/m2-medium-curly-hair-v1/build.py
python -B scripts/m2-medium-curly-hair-v1/check-source.py
node scripts/m2-medium-curly-hair-v1/qa-runtime.mjs F:/gamemake
python -B scripts/m2-medium-curly-hair-v1/fit.py --target PATH --target-sha SHA256 --id TARGET_ID
```

`spec.json` 与生成脚本是可编辑源，`curves.json` 保存实际生成中心线。构建先重复计算并比字节，已有异字节产物拒绝覆盖。`fit.py` 核真实目标SHA、骨/绑定、原cap、材质/纹理及保护头区，允许范围内的下前脸差异还需实际三角接触检查。通过后写新目标fit与manifest，失败写FAILED.json。新增资源只给确切目标SHA，原配方与旧发型身份保持各自记录。

源投影为CPU三角画家法与平色，眼睫图中的暗块来自原透明纹理几何的平色替代。它用于检查几何轮廓，实际头发材质效果需游戏查看。静止交叉为严格非共面诊断，零计数不代替动作/视觉验收。`runtime-cpu-qa.json` 使用真实GLTFLoader、原VRM和适配校验，纹理解码是1×1 CPU占位。

共同模板成本修正保留每束37个源中心线采样值，仅将表面环数36改14。最终3666顶点/7128三角满足现hair成本门，高采样8594/16984拒绝结果保留。采样顶点到邻64三角表面的最大上估可达12.17mm，游戏轮廓未验收。两者技术计数都不能改变造型失败状态。
