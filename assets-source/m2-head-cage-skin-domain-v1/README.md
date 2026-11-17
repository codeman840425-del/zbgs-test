# 头笼 skin-domain 单次响应对照

本包只修构造边界的输入域。原 `Head.__init__` AST 仅将 `all_endpoints.extend(ends)` 改为明确 Body_00_SKIN、Face_00_SKIN、FaceMouth、FaceBrow 材质的实际引用索引以及全部原 morph 端点。真实源码差异保存在 generated/bounds-only.diff。原 Head、Body field、空间 weights、anchors、precision5、20mm余量、27控制、2mm探针和八原请求均保留。原内嵌衣物未删除，也未隐藏。

## 实际一次结果

Blender4.5.9 LTS/build8bf95cbd38d1，原固定binary SHA见spec。2线程，3GiB/600秒限制，耗时9.714秒、峰RSS385110016B、exit0，没有重试。

女58个、男56个group base/原morph端点全部identity误差0，必要活跃点笼外0。女笼宽由549.768955mm变为208.198816mm，男由598.868668mm变为212.518215mm。每性别另有10个其他角色的活跃笼外点仍保留在源里。它们不参与新边界，未生成其变形形状或衣物结果。已有body-donor衣物适配和运行中隐藏重复内嵌服装的政策未改。

源点、Face三角、landmarks、源顶点/插值/直接点权重、全部八请求、控制索引与sign、探针、baseline与原5309c95b取证逐值相同。readback重新核实际源文件SHA并记录各材质实际primitive/原索引/targets，见comparison.json。两性响应完整tensor均为[3,202,9,3]，跨轴分量实测0仍完整保留。采样后identity误差0。

## 数据与复现

female.json/male.json 使用 `head-cage-skin-domain-response-v1`，数组布局沿原response包。responseTensor[probeAxis][landmark][control][outputXYZ]，flattenedResponseAxisMajor等于tensor.transpose(3,1,0,2).reshape(606,27)。baseline严格为(probedSample-sourceLandmarksM)/.002，未减evaluated-rest漂移。domainPrerequisite保存逐原端点identity和必要域coverage结果。

只执行CPU读回，无Blender调用

```powershell
python -B scripts/m2-head-cage-skin-domain-v1/readback.py
```

向新的包内目录复现一次响应（本次没有再执行）

```powershell
python -B scripts/m2-head-cage-skin-domain-v1/run.py --tool-root F:/gamemake --out assets-source/m2-head-cage-skin-domain-v1/recheck
```

输出目录必须不存在。执行输入、工具、旧AST和两个实际执行脚本SHA在spec/manifest/run-report。后补CPU readback脚本由files.json单独固定。domain-audit-input.json保留独审原证据，其中明确袖部极值是真实引用点，不能称unused。

## 边界

本包没有lstsq、控制系数求解、新形状、VRM/衣物输出或public/catalog写入。状态明确不可生产准入。旧响应、八失败与正式det/表情/实际半宽门不变。更窄边界及identity通过只说明响应取证可用，不能推定八请求可行、连续形变可逆、表达/衣物安全或视觉通过。下一LP仅作相同条件下的必要可行性诊断。
