# 唱播器材离线制作

两份可编辑 Blender 原稿与匹配的作者 GLB 来自 Grab3D。作者将模型以 CC0 1.0 发布，提供原稿、图像和许可文件供复核。来源及原始几何尺寸见 original/sources.json。[麦架](https://grab3d.com/models/music/microphone-stand/) · [谱架](https://grab3d.com/models/music/music-stand/) · [作者许可](https://grab3d.com/license/)

## 从已有母件制作

在本项目或交付包的 source 根目录执行。正常导出只需 Node。下列命令依次逐字节检查当前版本、向空目录导出，以及用自有配方导出不同姿态。

    node scripts/company-platform/build-singing-stage.mjs --check
    node scripts/company-platform/build-singing-stage.mjs --output output/singing-first
    node scripts/company-platform/build-singing-stage.mjs --output output/singing-custom --parameters assets-source/company-my-singing/parameters.json

从 parameters.json 复制自有配方，在 designs 中保留这次要制作的麦架或谱架，一份配方也可以包含多款。为变更后的款式指定新资源 ID 或递增 version。正式目录初次生成使用 --write，已存在的同版本资产逐字节校验。--output 的目标须是新目录。

将自有配方保存在 assets-source/company-…/ 中，在可写项目副本运行以下命令发布并复核。发布器固定配方快照，把新款加入现有资源目录。原房继续使用已绑定的资源版本。

    node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-my-singing/parameters.json
    node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-my-singing/parameters.json

- vocal 含固定三脚架、悬臂、麦夹、麦柄、领圈、网头。boomPitchDegrees 是绕原 X 轴的制作角度，−8 至 −4 度，负值抬高悬臂。clipWidthScale 是相对作者原夹宽的倍率，.93 至 .945，中性母件预收至 .94 并校正法线。默认网头语义为 singing-mic-pickup。
- score 含固定三脚架及同轴升降的内管、谱板与空白五线谱。scoreLiftMetres 是相对作者原关节的升高量，.02 至 .10 米。谱纸语义为 singing-score-pages。

两者都以米建模，Y 向上，正 Z 为乐手一侧。制作角度和高度烘入 GLB。两项设施都使用 floor-surface，不提供运行时活动关节、角色或音频。

## 从原稿重造母件

普通制作的母件在 master/。如需从作者原件重建，在已安装 Blender 4.5.9、Python 3.13.11、NumPy 2.4.2、SciPy 1.18.1、Pillow 12.1.0 的机器上执行。Blender 在 PATH 时可省略 --blender。

    python -B assets-source/company-singing-stage-v1/tools/prepare_master.py --blender BLENDER_EXECUTABLE --check
    python -B assets-source/company-singing-stage-v1/tools/prepare_master.py --blender BLENDER_EXECUTABLE --output NEW_DIRECTORY

作者原稿版本为 Blender 5.2.44，已用 4.5.9 禁用自动脚本只读提取；打开时可见版本提示。程序对照原 GLB 核验顶点、索引和绕序，按两份已锁原件的连通网格拆件。夹柄、网头、谱纸或源拓扑换型需要新适配。当前算法保留原 10,272 与 4,376 个三角。两款各有六张 512 平方 JPEG；原 2048 平方基色在线性光下平均，切线空间法线平均并重新单位化，金属/粗糙度通道按线性信息平均。所有导出及校验都只使用本地文件。

制作身份由配方、合同、生成脚本、作者原件、中性母件与依赖的 SHA-256 记录。母件重建会逐字节核对。可编辑原件和接收方所需脚本都在本素材族目录内。
