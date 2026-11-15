# 当前角色工程：恢复入口

更新2026-11-15；工作区F:/gamemake，分支feat/m1-foundation-room。先读本页、AGENTS、唯一能力表CAPABILITIES及阶段计划FOUNDATION-MILESTONES。旧流水归档history/CURRENT-FOUNDATION-through-f7dd1fbb4d03-2026-11-15.md，只作历史证据，不回退版本或重复已完成工作。

## 固定观看入口

- **外观工作台：4196，/?workbench=appearance，候选00fdad393503**。源码7ef73e197f98018b48dbd2ecf82f9fd56cab77c7，目录experiments/m2-appearance-workbench-v13/dist，指针delivery/appearance-workbench.json。当前准备提升，实际入口回执在后续记录；f7dd/v12、488/v11、836/v8均保留回滚。
- **M1已接受基础：4195，77e46efb5441**，源码e94ac1cbb8b4d4b1c7beddba0effa62d3cfa073a，目录experiments/m1-motion-identity-integrated-v1/dist，指针delivery/candidate.json。男女整链获用户“可以作为下一阶段基础”限定接受，evidence/m1-close-77e46-user-review.json；不将新外观能力继承为已人工验收。
- 4174为证据服务。临时4277当前提供00fd固定测试目录；不动其他历史/顾问服务，不凭历史PID终止进程。当前没有真实多人服务器。

## 本次已实现与证据

1. 男女独立顶部按钮，组内只列各自原版/下颌或腰胯样件；页内异步切身体不刷新。外观/动作/检查三页，脸/半身/全身、正侧背/房间镜头与暂停/停止常驻。男性及女性各一件独立短发，发/肤/虹膜/外唇色可用；新发/色彩/布局仍待用户观感。836有16项实际浏览器与4条正常速片，后续只做受影响门，不重复整套。
2. 五体无发基础检查：原男女真实头皮源已核，20b五体正侧背回读通过；基础模式默认无发，返回穿衣恢复已选发型，保眉睫和完整皮肤。保留原build证据，头皮多边形轮廓为已有资产限制。
3. 原男女嘴宽±4%真实几何；眉仅上移1mm/每侧外移1mm一个组合样件；鼻仅向前0.5mm一个端点。原底和全部表情一起处理，几何身份另记baseSHA+各recipeSHA+参数，不能伪造原文件SHA。嘴/眉/鼻分别复位、全零恢复原几何，不改身体、骨架或动画。
4. 本机每基模草稿v3保存上述几何/发型/颜色/真实装备entry与绑定版本。旧v2保眉且鼻none；旧v1眉鼻none。版本错明确拒绝；较新颜色或同值服装请求不被旧异步恢复覆盖。不是主播身份、云存档或M3。
5. 当前00fd实际浏览器13组通过、0pageerror：三域复位、v1/v2/v3保存重开/坏鼻SHA、男女和同源peer隔离、同骨姿/时钟/相机正侧45°鼻对照、眼镜代表装卸、男女正常1×近景表情讲话。evidence/m2-nose-sample-00fdad393503保留原片和59帧全时段抽审；未见明确新增鼻裂口/黑斑，变化细微。眼镜原前突/镜腿上斜保留，不升级整体支撑自然度。程序讲话不是音频唇同步。
6. f7dd眉定向9组+男女同姿门、58帧抽审在evidence/m2-brow-sample-f7dd1fbb4d03；早期idle图非同相位，后补暂停严格同姿图，失败比较条件保留。488草稿事务7组及近景片、5ddb两真实API反例失败也保留，不改标签。

## 制作、重建与备份

- 源目录face-parameters-v1、face-brow-parameters-v1、face-nose-parameters-v1均在assets-source和scripts下。鼻原addon仅POSITION morph，raw与补齐每形态NORMAL的final分开；从原底fresh重建的VRM/映射/normal-reference逐字节相同，原生blend容器不同如实记录。源与runtime全表达数值检查见各RESULT，不代替观感。
- 00fd新检出npm ci/build：**92产物全部字节一致**，evidence/rebuild-00fd-7ef73e1。新检出66鼻源文件与manifest全部一致，installer --verify通过，工作树干净，evidence/nose-source-git-bytes/fresh-checkout.json。
- 眉源首次暂存曾将CRLF归一化，18个pin文本不符；afc8872修复，失败保留。42文件全新检出及安装通过，evidence/brow-source-git-bytes。以后先给新增精确源目录设置-text，再暂存并执行scripts/check-source-manifest-git.py --revision INDEX，不能只看push成功。
- 启动/安装命令见APPEARANCE-WORKBENCH；根目录python scripts/serve-appearance-workbench.py服务4196。prototype下npm ci，然后npm run build -- --outDir ../experiments/<新目录>/dist；不得覆盖旧固定目录。
- 已核远端020b9560d4a3458d83a55d3801d368bf6403759a含眉归档字节修复；鼻源43406e2已push，7ef73e1及新证据正做本轮备份，以后续回执为准。真人影片/供应商原FBX/顾问账户资料仍ignored本地，未称远程备份。公开记录不含账户秘密。

## 保留限制与下一项

- 男女均技术美术候选。最终画风、正式直播特写、产品同屏人数未定；只验单人与双实例。普通电脑无设备，用户明确保留实测缺口继续；RTX4090/headless/模拟不能冒充目标机。
- 首次几何编辑仍有约315–328ms长帧；f7dd无录制女性直接嘴宽321.5ms。先眉后嘴的后测不能隔离浏览器/驱动缓存因果，不宣称优化或连续滑块流畅。00fd录像温态峰值85.1/72.9ms，不能覆盖冷态问题。
- 嘴宽之外的眉/鼻只一个代表端点，不是连续范围；眼部参数尚未实现，独立眉色/长发动态/完整捏脸、体型组合、M3和服务器未做。新几何只原男女，派生身体不自动继承。
- 下一工作：原男女眼部源风险只读核查（face-eye-parameters-v1），先看眼白/虹膜/睫毛/眼睑/眼骨与blink联动；未批准为已可用滑块，不生成大范围素材。保持已通过的工作台布局与草稿。
- 不重开封存裙装：用户要求按当前合入版收尾，瑕疵/成本保留，不能说已全部修好。不再改30秒Rokoko舞，原版与唯一一次优化已封存；视频转动作计有效路线，既有手臂/接触局限保留。
- 用户负责产品/观看，agent负责所有源编辑、绑定、导出、代码和运行检查。未收到新外观回执不当验收通过，等待期间继续有界独立工作，不扩成完整M2/M3或衣库。
