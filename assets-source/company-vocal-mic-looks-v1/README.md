# 落地唱麦的三种外观

三款沿用 `floor-vocal-mic-boom@1` 的安装和拾音合同。房间持有站位与进退方向，设备提供实际拾音网头。资源原点在地面，正 Z 朝歌手，固定安装包络为 0.66 × 1.75 × 0.96 米（宽、高、深）。读谱、镜头视线与 0.35 米进退通道须在安装后的房间检查。

| 资源 @1 | 可编辑结构参数 | 结构与适用范围 |
| --- | --- | --- |
| `floor-vocal-mic-disc` · 圆盘短臂唱麦 | `baseRadius`，0.18–0.24 米 | 双层加重圆盘、直立伸缩管、手轮锁紧的短臂。半径同时改变底盘和三只防滑垫的间距。 |
| `floor-vocal-mic-suspension` · 双梁悬篮唱麦 | `legSpread`，0.185–0.23 米 | 双梁从三角底架向上内收。斜撑连接后脚，悬篮由两个环与交叉弹性支承件组成。参数控制单侧底部梁心距。 |
| `floor-vocal-mic-broadcast` · 黄铜侧轭广播唱麦 | `columnWidth`，0.096–0.14 米 | 双层底座、装饰筋广播柱、弧形侧轭和两侧转轴。参数改变柱宽、装饰筋间距与上下压盖。 |

每款的 `commissioningPrompt` 记录制作提示词，`frameColor` 与 `accentColor` 使用六位 sRGB 十六进制色值。杆件、脚垫、侧轭等由配方生成后固定在 GLB 中。悬篮保留静态装配形状。音频、演唱动作和机械振动模拟超出本模块范围。

## 复产与发布

在项目或交付包的 `source` 根目录安装锁定的 `prototype` 依赖后执行。命令使用本地源文件。

    node scripts/company-platform/build-vocal-mic-looks.mjs --check
    node scripts/company-platform/build-vocal-mic-looks.mjs --output output/my-vocal-trial

试制目录须为项目 `output/` 或 `company-workspace/production-trials/` 下的全新目录。制作器先回读三角网格、三处接地、安装包络、口部至网头的首个命中，以及三个解码后为 512 × 512 的原作者 PBR 贴图。试制文件准备齐全后整目录发布。正式目录首次生成使用 `--write`，同版本冲突会报错；已存在且逐字节相等的资产可以复核。遇到一般 I/O 异常会撤回本次新建的文件并释放锁。如果进程被强制终止，接手者应先确认制作进程已经停止，再检查 `output/vocal-mic-looks/producer/` 的锁目录、暂存目录和正式文件，以相同输入复产。

制作自己的款式时复制 `parameters.json`，在 `designs` 中留下所需条目，修改名称、资源 ID 或版本及受支持的结构参数。将配方保存在项目内的 `assets-source/company-…/` 下；发布器保存输入快照并把新款登记到资源库。

    node scripts/company-platform/build-vocal-mic-looks.mjs --output output/custom-vocal-trial --parameters assets-source/company-my-vocal/parameters.json
    node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-my-vocal/parameters.json
    node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-my-vocal/parameters.json

## 素材、许可和几何

制作器从既有 `company-singing-stage-v1/master/microphone-stand.glb` 的中性母件读取实际网头、领圈、麦柄、夹具，以及原作者的基色、法线与金属度/粗糙度图。在与原款相同的 −8° 装配姿态下复用这四块网格的索引、顶点和纹理坐标。新制支架、底座和悬臂分别使用配方的金属、饰面和橡胶材质，三只实体防滑垫承重；保留的 `singing-tripod` 名称对应这三只垫。唱麦、各自承重构件和真实夹具在同一可编辑 GLB 中有独立命名。

Grab3D 将原始模型以 CC0 1.0 发布。作者原稿与原始 GLB、母件及重造脚本继续位于原唱播器材目录。生成资源的 `provenance.dependencies` 记录九项本地依赖及 SHA-256，`functionalContractSource` 指向原功能合同。新款继承原款的 `floor-vocal-microphone` 制作分支，环境规范上级是 `theme-live-kit`。[作者模型](https://grab3d.com/models/music/microphone-stand/) · [作者许可](https://grab3d.com/license/) · [项目采购与哈希记录](../company-singing-stage-v1/original/sources.json) · [功能合同](../company-singing-stage-v1/contract.json)
