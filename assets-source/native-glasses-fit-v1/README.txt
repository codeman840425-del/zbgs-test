原生候选眼镜适配生产 v1（候选，尚未人工视觉验收）

输入：固定987实际游戏加载后的四个native身体、同一原版眼镜c8098a。
input-987使用glassesFit=legacy，仅采集未适配框架的基准矩阵和最终蒙皮表面；这是制作诊断，不是绕过规则交付成功。保留站/坐与近景图；该采集播放讲话，耳/太阳穴区域拟合，不能冒称全脸中性表面。

复用现有assets-source/acc01-temple-fit-v1四环镜腿/LP方法。新源头部表面和耳上缘重新求值，固定铰链、保眼镜拓扑/材质/框架；原身体和原眼镜不改。bounded选择器和现有镜腿范围只适用本组输入，不能宣称任意头型。

制作：python scripts/build-native-glasses-fit.py
接入：python scripts/stage-native-glasses-fit.py
CPU：node scripts/qa-native-temple-profile.mjs F:/gamemake evidence/NEW-UNUSED-OUTPUT
真实运行后须使用正常fit路径，不带legacy参数。生产接口接入现有glasses-temple-fit.js，无专用人物控制器。

来源：项目既有自制studio-glasses-v1，原source与许可见assets-source/acc01-temple-fit-v1及prototype/public/assets/m1c/accessories.json；四原生身体各自来源沿其源包/VRM元数据，不扩大素材许可。
重做必须保输入构建/身体/源眼镜的精确身份。新源调整后按相关头面依赖重算，不能仅把body SHA改成另一个。

Independent CPU review: finite Temple/skin intersections remain near ear crest (female max segment 0.678 mm, male 0.183 mm); not contact-clear. Classification pending actual near/normal-speed viewing. Source: evidence/native-glasses-fit-independent-v1/report.json. No zero-contact claim or arbitrary-head support.
