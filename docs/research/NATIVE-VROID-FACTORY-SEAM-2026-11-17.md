# 原生 VRoid VRM1 的完整工厂接缝

2026-11-17，只读评估。目标是 VRoid Studio 2.16.0 / Bridge 0.15.0 导出的 `assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm`，SHA256 `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3`，16,315,696 bytes。对应 `.vroid` SHA256 `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de`。旧2.14参数读回只作前序来源，升级后的三项参数未重新逐项核验。

## 可复用与实际缺口

房间证据 `evidence/native-vroid-room-78912-v1/` 已实际运行 VRMLoaderPlugin、normalized retarget、createMotion 和自身 vrm.update。VRM1站立/走路及4个单表情可用，脚底校准仅用了可见rest最低点。原人物承担导航任务，候选未进入完整工厂。固定服务为83decd027116；本次另只读当前树329e1856上的下列入口，未运行新factory。

| 层 | 已有实现与新角色所缺内容 |
| --- | --- |
| 人物加载 | `foundation-avatar.js:86` 的精确SHA、GLTFLoader/VRMLoaderPlugin、rotateVRM0和一次sourceFloorY可复用。新profile需自己的ID/URL/SHA、明确测量的鞋底和实际服装配置。VRM1不应复制旧VRM0场景旋转或旧身体常量。 |
| 独立衣装 | `m1-equipment.js:13` 必须加载manifest、默认装备，成功后隐藏原内嵌衣物。当前没有保留整套内嵌衣装的profile模式，因此只登记新VRM不能完成加载。`equipment.js:141` 同时核bodySHA、raw/semantic骨映射及IBM。旧衣物改SHA不能适配。 |
| 覆盖与接触 | 原Body/Top triangle mask、garmentCoverage、裙修正、前臂/手部profile均不可继承。首次只保原生上衣/短裤/鞋组合，覆盖如确有需要再由新source实际索引生成。前臂/手接触配置应从新体重算，未制作时明确缺失。 |
| 外观 | 原发色/肤色按材质语义的实例化逻辑可复用，但仍需实测。该源材质带` (Instance)`，原Face/Body/HAIR类别正则能识别部分角色。原眼唇palette及surface精确材质名、贴图、UV遮罩不匹配78912，非original配色会被拒绝。原眉鼻眼/嘴宽几何算子、替换发型、无发准入和配饰fit没有新body身份。 |
| 表情/直播 | 真实VRM1 preset可由官方expressionManager消费；本次只看blink/happy/aa/oh。原eye-blink兼容补偿是精确源准入，未知源会保原行为，不能移植旧Joy负补偿。createLivePresentation要求head/手臂/手指语义，眼镜/麦克风另需新fit；本次未进该层。 |
| 配方 | `appearance-recipe.js` 严格比对bodyType+bodySHA、palette版本、equipment manifest URL/资源和各fit。原配方不能重标到78912。新角色首先只保存真实original外观和自身装备组合，旧v6/v7/v8含义保持。original配色目前可延迟加载palette，不能据此开放未制作颜色。 |

原源实际为3个mesh、14个primitive，Face共享POSITION accessor0并有57个真实morph targets；Body共享POSITION127含Body/Bottoms/Shoes/Tops/HairBack五primitive，另有独立Hair001。三skin各130 joints。不能用旧Face54targets、旧材质名/UV/索引、旧IBM或完整裸体假设解释它。

## 最小下一实施包

1. 先封原生源、默认素材/第三方输入来源和许可设置。只读提取新源的top/shorts/shoes三个实际primitive，以相同源rest、JOINTS/WEIGHTS、IBM、node/bind矩阵及原MToon材质/图片生成独立资源与`zbgs-equipment-v1` manifest。沿`equipment.js`合同给每条bindings的sourceBone/targetRawBone/humanoidSemantic/inverseBindMatrix和真实bytes/SHA。已有`m1-variants/build-equipment.py`含转unlit步骤，不能原样套用而丢掉原MToon。要求原内嵌与独立装配rest/若干姿态读回一致，原VRM完整保留。
2. 在既有foundation profile增加唯一新body和明确短裤默认outfit。当前`foundationProfile`固定先生成index0 pants，需最小数据化显式默认outfit入口，避免把短裤语义伪称长裤。其余控制器/动作继续共用。首包不借旧裙/帽/长发/眼镜fit，不因未制功能默认开放。
3. 补原生角色的可用能力数据和独立实例/处置、快速切换、真实factory站走、原生表情、同body保存后改外观再恢复。关闭未适配选项要给明确原因。之后再逐个制作新palette和独立换装fit；overlay录像只作前置输入。

以上为待实施建议，未生成装备、未更改profile或4196，完整factory及recipe尚未验。

## 默认meta的官方含义与真实设置入口

官方允许符合条件的VRoid自制角色商用，包括无特别条款的内置基础模型和衣物，同时保留pixiv对内置素材的权利，内置资产不是CC0。特别条款、第三方贴图或样例需逐项遵守。制作/输出角色的对外应用另受character-creation-tool条款约束，内部自用工具与外发游戏应按实际用途分清。[VRoid Guidelines](https://vroid.com/en/studio/guidelines)、[官方商用FAQ](https://vroid.pixiv.help/hc/en-us/articles/4405813333657-Can-I-use-the-models-created-with-VRoid-Studio-Stable-Ver-for-commercial-purposes)

当前文件明确写`onlyAuthor / personalNonProfit / allowRedistribution=false / modification=prohibited / creditNotation=required`，authors为`gamemake technical study`。这些是模型许可人对下游的授权设置，不证明pixiv禁止作者自己商业使用，也不证明本机输入的权利链已核完。VRM Public License只授予许可人有权许可的权利；当前保留作者内部技术研究边界，不直接据默认值判定商业素材获准或永久不可用。[VRM Public License 1.0](https://vrm.dev/en/licenses/1.0/index)

官方VRM1真实字段位于`extensions.VRMC_vrm.meta`。`name`、`authors`非空数组、`licenseUrl=https://vrm.dev/licenses/1.0/`为核心身份。`avatarPermission`取`onlyAuthor/onlySeparatelyLicensedPerson/everyone`，`commercialUsage`取`personalNonProfit/personalProfit/corporation`，`modification`取`prohibited/allowModification/allowModificationRedistribution`；`allowRedistribution`为布尔值，`creditNotation`取`required/unnecessary`，可另存`copyrightInformation/references/thirdPartyLicenses/otherLicenseUrl`。这些独立字段需反映实际许可，不能从一个商用字段推导全部再分发权。[VRM1官方meta规范](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/meta.md)、[官方Hub条件显示规则](https://developer.vroid.com/en/guidelines/conditions_of_use.html)

VRoid官方导出使用条件界面可设作者和许可。帮助页同时包含旧VRM0/CC选项，2.16 VRM1应以实际界面和导出后上述schema读回为准。本机Bridge0.15真实`tools-list.json`的`vroid_export_vrm`支持`title/author/model_version`，未暴露任何commercialUsage、avatarPermission、modification或redistribution参数，现无已验证MCP许可setter。可由工具操作官方导出界面设置，另存新版本、核meta及新SHA；该设置只表达权利人真实授权，不能代替原素材许可。本次未操作界面或改写元数据。[官方导出许可说明](https://vroid.pixiv.help/hc/en-us/articles/360012475013-About-Avatar-information-permission-settings-regarding-the-Avatar-s-characterization-redistribution-alterations-usage-conditions-settings-screen)

## 本次读码身份

`foundation-avatar.js` SHA b3634ccbe0c8cba31634e3357ddc4d31281d08c85ffdf101bdd1c398febeba83；`m1-equipment.js` cdfd985a4a1972932d2519f30b3ba57210003429107b0a4e7ed7cf2492dada10；`equipment.js` e05354e427f1d0ba580d92a6346ba6f3b8ff72ba68b8204af959138f80bed342；`appearance-recipe.js` 9c44d61688e72fd85b37f03e96be833a881ce532326922fd5ba8e7cd4ebd349e；`character-appearance.js` 361f19509cad7cf7f9951a0b0030fbeb793f235b0c13fff37cc61a93ff6f887c。网页于本日读取，未安装、运行新接入或发布素材。
