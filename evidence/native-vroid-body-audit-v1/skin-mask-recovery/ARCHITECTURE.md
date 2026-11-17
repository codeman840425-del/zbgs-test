# 已测皮肤恢复后的最小资产接缝

只读建议，未采纳/实现。游戏运行应只消费有身份的VRM/GLB/manifest，不需要VRoid、Bridge或froz常驻；它们是目前已验证的离线作者工具。离线可重复制作仍依赖原生工具，不等于已具备完全自研、无需第三方编辑器的全部生产能力。

## 当前20个skin辅助骨不能省略

`equipment.js:156–164`将每条manifest binding映射到现有avatar raw bone并验IBM；`:203–218`将衣物Skeleton改绑到这些骨，明确不附加独立armature。新110 joint基体缺原Top实际使用的10个骨，影响250/739个顶点，最高缺失权重.9；这不是仅未使用joint表多了几行。另有10个非skin链尾，完整拥有关系应以30个raw节点/10条spring链为单位，不能只克隆20个skin骨。各aux根挂左右上臂/大腿，不是单head挂点。

## 可复用的成熟部分与真实新增工作

项目`hair-spring.js:29–55`已有独立附件骨/IBM/rest校验，`:197–237`用已安装官方3.5.5 `VRMSpringBoneManager/Joint/Collider`创建独立管理器，`:241–247,294–318`含reset/update/dispose；`character-appearance.js:166,235`负责实际发型生命周期。这能复用生命周期与官方模拟算法，**不能把头挂式独立发型合同直接套到混合人体骨+衣物骨的skin**。

已核官方 `VRMSpringBoneLoaderPlugin.afterRoot`把manager放入`gltf.userData.vrmSpringBoneManager`；VRM1导入通过同一GLTF parser中的node索引解析joint/center/collider。它不会自动把独立衣物里的人体骨映射到现有avatar，也不会替我们处理卸衣、换装、重复manager所有权。因此仅给equipment loader注册该plugin不够。[官方3.5.5源码](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-springbone/src/VRMSpringBoneLoaderPlugin.ts)

正确的附骨方案需：从已封原生源导出30节点最小拥有子图、精确父挂点/rest/IBM和10条spring参数/碰撞引用；人体bone映射到已验110基体，衣物aux只创建自身拥有节点；skin按原序引用两类真实骨。按实际挂接后的节点与collider构造官方manager，避免重复人体或头发模拟；每次装备prepare/commit/dispose完整回滚、换装只卸自身节点。保留原数字/语义骨名别名处理，不把普通同名骨当可共用。原生spring动态参数在`auxiliary-spring-readback-v2.json`，不需要新手调弹簧公式，但附件绑定/生命周期是尚未实现且须数值+运行验证的新接缝。官方库MIT，不代替资产许可。

## 眼下更小的限定过渡方案

若root优先打通此已存在女性装备的基础模式，可制作**一个明确混合来源的新标准资产**：保留78912原完整130 joint/160 raw节点、原表情/材质/原始衣物和spring数据，仅将其Body贴图资源替换为本次原生卸Tops导出的真实RGBA。此处不用“填alpha为255”代替来源：复制已封原生PNG字节，保双源SHA及转换清单。实测同尺寸、UV/几何/rest/绑定零差和整图RGB全等，给该转换提供直接依据。

这是一次离线标准GLB资源替换，预计接入面小于新增混合骨架装备：不改当前运行骨架策略、不改蒙皮、不改运行时肤色。仍须检查该image全部消费者，仅允许目标Body纹理语义；若被其它材质共享应隔离新image引用，不覆盖无关图。所有非目标accessor/IBM/morph/extension字节或语义保持并独立回读，产物新SHA，新装备manifest需由真实绑定验证生成，绝不是裸改兼容SHA。原Top已有全部辅助骨留在基体，其动态仍由原VRM管理；衣服隐藏时这些节点保留，这是有意的有限过渡，**不能外推任意新增带骨衣服**。

过渡源完整皮肤曝光后仍需该自身上衣的覆盖/动作实际验证，不能沿旧SkinMask继续永久隐藏皮肤；基本模式应能恢复真实皮肤，穿衣时需要时使用当前装备coverage合同。此过渡只建议下一次有界CPU转换+独立读回，再同房间基础/衣装/动作验收；本包未生成转换候选，也未改runtime。

长期独立衣库若要加载此前不在基体中的新骨装，应完成前述装备拥有辅助骨机制，不能不断将每件衣骨塞进共同基础源。root在范围/成本整合后决定先后，本报告不擅自选择或启动新制作。
