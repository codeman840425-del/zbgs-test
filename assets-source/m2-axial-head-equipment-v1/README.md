# 原男 lean 头部候选四件装备

本包适配原62b男源的既有上衣/领带、长裤、露膝短裤和平底鞋，没有新增款式。唯一目标是实际 `male-long-lean-axial-head-v1` VRM，SHA256 为 `83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9`。它只施加四个头部参数，身体体积参数未施加。round 未生产。

完整输入与源码身份在 spec.json，预检在 prepared.json，实际生成与回读在 generated/report.json、generated/fit.json。源文件仍在原目录并保持原 SHA。源许可继续沿各 sourceEntry.sourceLicense 的原出处与边界，本包没有新增第三方素材。

## 实际适配

| 装备角色 | 新条目ID后缀 | 顶点 | 改变点 | 最大位移 mm | 输出行为 |
| --- | --- | ---: | ---: | ---: | --- |
| top 外衣面 | -top | 1399 | 370 | 18.795680 | 新 GLB |
| top 领带面 | -top | 77 | 22 | 17.496003 | 与上衣同一 GLB |
| pants | -pants | 1096 | 0 | 0 | 原字节 |
| shorts 主面/内贴 | -shorts | 610+192 | 0 | 0 | 原字节 |
| shoes | -shoes | 566 | 0 | 0 | 原字节 |

所有新条目ID以前缀 `male-long-lean-axial-head-v1` 开始。完整的 `zbgs-equipment-v1` 四条 manifest 位于 generated/equipment.json，资源URL是同目录相对文件名，建议发布前缀为 `/assets/m2-axial-head-equipment-v1/`。兼容SHA只指向上述83f目标。

上衣 GLB 为 `dc2d2f4638049283981ee0decc83748daf715eeeef02a2c3df2f7766d38722ae`，2799020 bytes。裤、短裤、鞋的输出 SHA 分别仍是 `e4e213c9eed7912ff7fa75b81c957b7e944036ffb81cdcbd63813c11bd7e168c`、`c8a1afd0742cbb99302abc107673744751a8cfd77c6c89df039b068054a947d0`、`3e855c7f39a183ab44b8aef3ac92898f6ebc36a7cbc0e6ccfdd485b85607fe2f`。每个实际源点的 G(P)=P、DG=I 均已核验，复用依据保存在 fit.json。

原/新身体 nodes、skins 保持一致。每件独立装备逐骨核原始raw名称、humanoid语义、manifest绑定、实际IBM和rest世界位置。装备mesh根为identity且无隐含缩放，坐标均是原source rest米制。对每件合成一个错误1mm IBM的预检均明确拒绝。

上衣1399点、领带77点、长裤1096点、鞋566点与原身体内嵌同材质面原坐标精确对应，其变换后Float32位置与新VRM对应点差为0。短裤经既有编辑导出，主面610点中187点可精确对应原长裤，423点不作源长裤同点声明；192点内贴为既有短裤独立几何。全部802短裤点均在G支撑外，实际J均identity，没有用部分对应替代完整identity核验。

同一个已封PPoly G作用于装备P，原作者N由对应实际DG经未改legacy.normal_map逆转置传递并保原长度。没有重拟曲线、改knots、加offset或更新骨架。容器复用已核导出接缝，保原binary prefix、accessors、索引、UV、材质、图片、权重、IBM和所有共享消费者。四件均无morph。上衣实际Float32位置最大回读误差5.912e-8m，NORMAL向量最大误差4.285e-8。新增退化及非正参考法线dot为0。几何法线和实际MToon着色观感仍是后续检查。

四个GLB和equipment.json进行了同输入重复构造，资源字节与manifest完全相同。计时证据字段和forearm generation回执含运行时间，不宣称这些报告字节可重复一致。

## 接触与覆盖

原 `scripts/m1-variants/build-forearm-profile.py` 在实际83f VRM重新生成 generated/forearm/profile.json，SHA256为 `1f53f907b5c5904d9f45b3201858b509a2e9deaf401df19624ada5c3f0b312eb`。没有只替换旧profile的bodySHA。双臂实际选中顶点/面、POSITION、JOINTS、WEIGHTS及IBM与原源逐值相同，来源hash与原索引见 forearm-source-equivalence.json。原生成器的bind-only/有限轮廓及posed覆盖限制保留。

原男性profile没有bodyCoverage。旧top+outer的56face garmentCoverage不属于本四件组合，未继承。运行原重复衣物隐藏规则不在本包修改。没有新增身体mask，也没有声称手表面/外套/袜/长发/额外附件的兼容性。

fit.json是源侧精确适配证据。条目使用新fitId，但没有把这个新schema塞入现runtime仅处理onePiece shapeFit依赖的fitResource字段。root发布与profile注册仍需按现有基础装备加载合同接入。旧shorts materialRecipes未作为新条目的活动配方继承，原来源完整保存在sourceEntry，颜色适配另行核证。

## 重建

NumPy2.4.2 / SciPy1.18.1，使用现有隔离venv。build入口拒绝已有generated，保留首次失败。

```powershell
& experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-axial-head-equipment-v1/prepare.py
& experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-axial-head-equipment-v1/build.py
```

需要重演时，在独立检出中将原generated完整移到检出外归档，再按原pin源与脚本重建。prepare不写原素材，build只写本包generated。派生实际资源、forearm profile、源fit/绑定检查均已产出；游戏换装、姿态接触、领口表情/运动视觉仍未验证。没有public、runtime、4196或原装备更改。
