# 眼镜 clone/dispose 实际资源回归

固定公开候选 `1a0d06fc8ffe`（4191），精确源提交 `0ae64b83384a3ed9853185f6a008ac6b70b1e8cc`。**男女各6轮真实按钮装备/卸下完成；首轮之后计数无逐轮增长。**

测试沿默认原身体、原装备0、idle动作，不设置附件状态、不改渲染器配置、不强制GC。使用真实“装备眼镜/卸下眼镜”按钮；每次状态完成后等待3次rAF，并核`renderer.info.render.frame`实际前进3帧再采样。读取真实完整`scene.traverse`，不是只数scene.children。

| 身体/阶段 | geometries | textures | programs | 场景mesh数 |
|---|---:|---:|---:|---:|
| 女，装前 | 88 | 44 | 22 | 95 |
| 女，首轮装上 | 95 | 44 | 24 | 102 |
| 女，首轮卸下 | 88 | 44 | 23 | 95 |
| 女，第2–6轮每次装上 | 95 | 44 | 24 | 102 |
| 女，第2–6轮每次卸下 | 88 | 44 | 23 | 95 |
| 男，装前 | 88 | 45 | 20 | 95 |
| 男，首轮装上 | 95 | 45 | 22 | 102 |
| 男，首轮卸下 | 88 | 45 | 21 | 95 |
| 男，第2–6轮每次装上 | 95 | 45 | 22 | 102 |
| 男，第2–6轮每次卸下 | 88 | 45 | 21 | 95 |

首轮后program各比最初多1，保留原值且未归零；本次没有进一步判定该首次shader保留的原因。按授权把首轮独立列为预热，随后五轮on与off两组的四项计数均严格一致，没有放宽阈值。每次卸下几何数量回到装前，纹理数量始终不变。

12次装备，真实附件根均为1、每个实例有7个mesh；12次卸下根均为0。每次加载geometry UUID与前次不同；原身体身份/装备/动作未改变，状态与按钮提示正确，零pageerror。前后独立核对实际身体bytes SHA、runtime/served build身份。

Chrome157.0.8103.51，1440×900，开发机当前真实WebGL路径；记录的是renderer资源**数量**，不是GPU显存字节、JS堆、长期零泄漏证明或普通PC性能/FPS通过。未做GC、帧率测量、录像，也未重复派生拒绝/503/race用例。浏览器关闭，既有4191服务未修改。

复跑需要新输出路径，服务必须仍为相同固定身份：

```powershell
$env:QA_M1_BUILD='1a0d06fc8ffe'
$env:QA_M1_RUN_ROOT='output/playwright/m1/1a0d06fc8ffe/glasses-resource-cycles-next'
node scripts/qa-glasses-resource-cycles.cjs http://127.0.0.1:4191/
```

完整逐轮renderer/program ID/附件及geometry UUID/身份在report.json；脚本同字节副本归档。
