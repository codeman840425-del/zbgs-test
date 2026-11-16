# 可见五官 runtime：身份与旧资源保留审查

结论：本次有界只读审查**没有发现 source identity / legacy preserve 的新增阻断**，可冻结当前代码供后续实际回读。此结论不把已有源法线比较失败改标通过，也不代替浏览器/用户观感验收。

审查 `facial-geometry.js` SHA `ed813b5d070ee0a75b9757b772696297f11e3d28e5abba5fe19038a86759a597`；其余模块/安装器精确 SHA 见 `report.json`。只运行安装器 `--verify` 与文件字节核查，没有改产品或资产，没有重跑 endpoint/组合大矩阵。

- **身份门**：新嘴在固定 profile 中单独登记原 F/M 的 recipe SHA，实际验证 baseAvatar、position、各 primitive index/UV/normal 和所有 source morph 数据。新眉 raw recipe 缺完整 morph hash，通过同底 pinned 新嘴验证 immutable 原 morph/normal 后，再核眉自己的向量/材质点域；新鼻/眼各自核固定 sample/幅度、原属性、保护域及法线邻域。未见用性别前缀或改 SHA 绕过新源身份。male jaw 仍仅旧 +4%，其它派生未扩大准入。
- **旧值保持**：旧嘴范围继续使用旧算子/recipe；新增 ±12% 是独立离散值，未扩为任意 ±12% 连续区间。眉/鼻/眼旧 sampleId 与新 sampleId 对应独立 URL/recipe，Map 以 sampleId 在每 actor 实例内缓存。旧 v1–v4 保存记录限制在原参数/样件，并在 set 时核其旧 expectedRecipe SHA；v5 才可声明新样件。新安装器不写旧目录。实际比较旧五个 public 包共 **14 个文件**，与固定基底 `6d99579d0eea2285c7412775d15edf0fa584cc1d` 的 Git blob 完全相同。
- **组合/事务**：每次请求用局部 selected recipe 引用，从唯一 immutable 原坐标重新计算，不累计当前变形；按实际活动域做法线并集，新嘴/鼻交集没有被最后一域覆盖。完成 prepareRender 后仍核 request generation/disposed，旧请求不提交；只处理 actor 自己的 clone，恢复原 geometry，不改变 VRM 表情绑定。缓存不是跨演员共享的 mutable geometry。
- **安装保留包**：`node scripts/install-face-visible-workbench.mjs --verify` 实际 exit0、copied=false。安装器所需 canonical final 全在 retained 清单内，不依赖已忽略的 raw/repeat/fresh 二进制。安装前对全部 source manifest/recipe/实际原底及 final SHA 校验，既有输出不等则拒绝；不会混写旧新包。

相关真实代码位置：`facial-geometry.js:63`（完整源身份）、`:209`（分样件眉缓存/伴随源验证）、`:269/:334`（鼻/眼身份）、`:413`（局部组合/法线并集）、`:505`（请求提交与保存身份）、`appearance-recipe.js:34`（旧 schema 边界）。

复用并核对了 prototype 的 `contract-1/report.json` 17项实际真函数/原数据报告，没有把它写成自己的执行。其后三模块与当前字节相同；appearance-recipe 的报告 SHA `886295…` 与当前 `f7d254…` 不同。初次严格核验如实失败并存 `initial-strict-failure.json`/当时脚本；随后精确证明将当前 LF 改写为 CRLF 恰重现完整原 SHA，内容仅行尾差异。当前真实 SHA 与旧报告 SHA 都保留，未重贴旧证据身份。

当前 `legacy-source-final` 已有11项旧端点通过；`new-source-final` 仍有男 `mouth88` 原门失败：FaceMouth、shape2、v314、Y normal误差 **1.1056661605834961e−5**，超过原 **1e−5** 门。它不是 identity/legacy 审查发现的新缺陷，但不能由17项组合结果或本结论覆盖。此审查没有修改源、补偿纳米位移、调阈值或称10项全过。女性大幅眉侧视悬浮、眼部实际注视/透明边缘及嘴腔观感也仍需对应实际片。
