# 原生脸部参数批次的运行时接入

两个 FaceContour 样件的原始 VRM 已通过差分。实际游戏身份取完整身体合成后的 SHA-256。装备、皮肤覆盖、配件与角色记录都按这个身份查找并核对资源。

| 功能 | 接入位置和最小数据 | 复用条件与新增检查 |
| --- | --- | --- |
| 身体和装备 | `foundation-profiles.js` 中的 `FOUNDATION_PROFILES`、`foundationProfile()`。每个身体需独立 bodyType、资源 ID/URL/SHA、装备清单 URL、上衣/短裤/鞋 ID、固定初始套装、覆盖清单 URL/SHA、`baseBodyDisplay: 'source-with-hair'`、实测 `sourceFloorY` 和座位层厚度。 | `foundation-avatar.js` 按 SHA 加载 VRM，应用原始鞋底对地偏移。`m1-equipment.js` 与 `equipment-set.js` 以实际 body SHA 查服装绑定。`scripts/production/native_import.py` 验证三槽、覆盖图消费者及资源闭包。身体/服装字节不变的部件仍需针对最终包核 SHA 与绑定。 |
| 基础动作和座位 | `motion-source.js/loadRetargetedMotions()` 按当前 humanoid 现场重定向基础 UAL、跑步及通用动作。`motion.js` 和 `foundation-avatar.js` 读取 normalized bones、实际鞋底接触与座位参数。 | 确认完整身体 humanoid/rest、实际 Body 和鞋的接触依赖。体型相同可复用已证控制器。站立、走跑、坐起及恢复仍用实际整套身体和服装现场验证。若测试其它固定舞片，其单项在 `dance-imports.json` 按 `avatarSha256` 查 variant。现批的基础动作无需重新生产冻结的 30 秒舞。 |
| 眼镜 | `live-presentation.js/createLivePresentation()` 从实际渲染虹膜与脸部前带计算镜桥、前向距离及缩放。`glasses-temple-fit.js/fitGlassesTemples()` 以 body SHA 查 `glasses-temple-fit-manifest.json`，核配件 SHA、配置字节 SHA/长度、左右镜腿 Float32 位置摘要。 | 对两件实际运行体生成未适配镜框的站/坐捕获，核 `fit.eyeFitMethod` 为 `rendered-iris-centers-and-face-front-band`，每件的四环 LP 用实测蒙皮三角和耳冠重新求解。沿用 `qa-native-glasses-fit-input.cjs` 的几何捕获和 `build-native-glasses-fit.py/build()`，把硬编码的 bodyType、assetId、SHA 文件列表改由 recipe 输入。为每体建新的 profile 与 registry entry。捕获仍要核发丝、耳、镜框及站坐姿态，LP 使用皮肤几何。 |
| 麦克风 | `live-presentation.js/loadGrip()` 和 `character-production-query.js/liveAccessoryChoices()` 同时要求 `/assets/m1c/grips/manifest.json` 的精确 body SHA 握姿条目与 `microphone-presentation-fits.js` 的 body SHA 键。握姿文件使用 `zbgs-grip-profile-v1`，含 `micRawHandLocal`、15 个 normalized finger quaternions、配件 ID/SHA 和 body SHA。使用姿态含当件 `mouthRawHeadLocal`、口端接触数据来源 SHA、原配件 grille pole 和使用偏移。 | 用 `scripts/native-live-accessory-fit-v1/mouth.py/one()` 逐最终 VRM 测 32 点唇缘及 AA 位移。手复用核 `Body_SKIN` 实际三角引用、手部 POSITION/JOINTS/WEIGHTS、IBM、rest 与 normalized 手指语义。若手依赖变化，回到 `fit.py/fit()` 的实际掌指与握姿计算。跟随 `stage-native-live-accessory.py/main()` 的资源格式，以 recipe 提供最终 VRM、原握姿及其绑定体、配件、使用姿态模板。场景复核实际口端朝向、握持、视线与坐起。 |
| 外观和头发 | `appearance-color-policy.js/appearanceColorSupport()`、`native-palette-catalog.js/nativePaletteContract()`、`appearance-candidates.js/queryAppearanceCandidates()`。`hairstyle-catalog.js` 按 `compatibleBodies` 查外置发，`native-hair-attachment.js/validateNativeHairFit()` 检查 fit、asset、头部目标及 SpringBone。 | 两体均声明当前原生色支持。新 body SHA 缺从原版原生色表继承的记录，`appearanceColorSupport()` 当前会默认广开颜色，因此应用于实际查询和保存的原色限制应共用登记入口与现有精确色表。基础外观使用 VRM 自带头发。当前男用独立原生长发 fit 精确绑定 7586。未来外置发加入新体时按当前头部、辅助骨、权重、碰撞体、帽发与肩部检查，沿用 `scripts/native-vroid-hair-equipment-v1/build.py` 与 `stage-native-hair.py` 的配置格式。 |
| 角色记录 | `character-production-query.js/queryCharacterProduction()` 从已加载活动体和登记表返回实际道具和服装选项。`live-accessory-record.js` 捕获实际 SHA 并回读完整 presentation 和 fit 身份。 | 同一 factory 查出两件独立 bodyType，逐件装备眼镜和麦克风后捕获记录，在关闭后用实际 consumer 恢复。配件验证后仍保留当前舞蹈、招手与持麦组合约束。 |

眼镜的采集配方输入为新体 bodyType、assetId、body SHA、明确的编译候选和采集输出路径。站姿 JSON 供 LP 消费，坐姿及运行画面供接触比较。麦克风的离线候选输入为完整游戏 VRM 和精确握姿参考，实际文件校验和新登记由集成与运行验收分别确认。

运行 `python -B scripts/production/native_accessory_batch.py --recipe <recipe.json> --output <新目录>`。历史脸部捕获实跑得到与归档完全相同的眼镜文件。批次对捕获内实际 body SHA、未适配状态、配件 SHA 及眼桥实际几何采集方式做校验。运行报告提供拟登记的眼镜、握姿与麦克风使用姿态数据。两项回归覆盖归档兼容、错误捕获、错误 SHA、已有输出及有效兄弟保留。[试跑配方](accessory-smoke-recipe.json)

两份最终运行体已离线实测。各自 1,093 张手部引用三角形、相应蒙皮位置、关节、权重、逆绑定矩阵及相关骨架休止局部帧与参考体一致，握姿数值可进入新身份的装配复验。两体独立测到相同的 32 点中性唇缘中心和 AA 口型中心。场景中仍需验证麦克风端头、手指握持、眼镜和发丝接触及道具恢复。[最终体麦克风配方](microphone-final-recipe.json) [两份结果](microphone-final-v1/result.json)
