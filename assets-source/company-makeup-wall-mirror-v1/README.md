# 墙挂化妆镜可编辑源

目标规格为 makeup-mirror-wall@1，四个 designId 为 round、lit-frame、arch、tri-fold。完整固定功能以 docs/COMPANY-MAKEUP-WALL-MIRROR-CONTRACT-v1.txt 为准。

parameters.json 是制作输入，scripts/company-platform/build-makeup-wall-mirror.mjs 是制作入口。生产器调用已交付 build-makeup-mirror.mjs 的 createMakeupMirror，排除 base/post、烘焙刚体平移，再增加真实闭合安装板。初始实际导出发现灯接头及三折框同向共面重叠后，同一轮修正将灯支架改为端面接触，并将三折镜框按固定 15° 角平分面闭合斜接。镜片、厚背板、各面位姿及光配置保持合同值。每个原始 GLB、参数、生产器和许可依赖在 dependencyPins 中保留 SHA256。此次使用项目原创源码改造。已核 Kenney bathroomMirror 保留为研究候选，其几何没有用于本包。

运行 node scripts/company-platform/build-makeup-wall-mirror.mjs 导出四个 GLB、resource.json、collection.json 和生产证据。运行同命令附加 --check，重新生成并逐字节比较正式产物，不读写 evidence。作为模块 import 时不写文件。生产必须通过真实 GLTFLoader 读回、新数据门和独立墙挂几何门。

允许的 round.frameWidth 范围为 .009..016m，真实轮廓随之改变。正式输入 .014m 与隔离的 before 输入 .012m 进行实际导出比较，其他三款 GLB 必须字节保持。失败初始模型和原参数另存 initial-original-head，不用其身份代表修正结果。

灯罩发光、实际 SpotLight 和反射分别由共享运行链消费。此源生产检查只覆盖 CPU 导出/几何，实际墙安装、真实反射及补光、关闭恢复、C3 使用、普通电脑表现和视觉验收仍各需独立证据。三折保持固定展开，无折叠状态。
