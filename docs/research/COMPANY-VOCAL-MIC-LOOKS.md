# 给唱播间换一支落地唱麦

工作室使用圆盘短臂款，出租屋使用黄铜侧轭广播款。制作 agent 可以在批次里更换 `resource.id` 和 `version`，保留原麦架实例、歌手站位和整间房。原三脚悬臂与双梁悬篮也适用。[两房批次](../../scripts/company-platform/batch-inputs/vocal-mic-look-rooms.json) · [麦架和歌手的坐标约定](COMPANY-SINGING-ROOM-PRODUCTION.md)

| 资源 ID | 实际可见的结构 |
| --- | --- |
| `floor-vocal-mic-boom` | 三脚底架和长悬臂 |
| `floor-vocal-mic-disc` | 加重圆盘、直立伸缩杆和短臂 |
| `floor-vocal-mic-suspension` | 开放的双梁支架和防震篮 |
| `floor-vocal-mic-broadcast` | 阶梯底座、广播柱和有侧轴的叉形支架 |

## 生成和检查房间

在独立交付包的可写副本安装锁定依赖，再从副本的 `source` 目录执行。以下命令同样适用于场景工程根目录。批量生产会给每个房间保存完整配置、资源版本和检查结果。

```powershell
node scripts/company-platform/build-vocal-mic-looks.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/vocal-mic-look-rooms.json output/vocal-mic-rooms
node scripts/company-platform/check-singing-room.mjs output/vocal-mic-rooms/singing-rental/layout.json
```

两间房都使用同一套麦架局部站位。实际检查从口部参考点向网头投射射线，量到第一次接触的距离，检查网头至支架的几处实体连接，并从眼位检查谱面。网头使用 `singing-mic-pickup`，相机、背景和谱架各自独立。造型通过后仍应检查最终房间，旁边新加的物件可能挡住拾音、视线或进退空间。

## 从美术配方再生产一款

在 `assets-source/company-my-vocal-mic/` 创建自己的 `parameters.json`。从[三款制作配方](../../assets-source/company-vocal-mic-looks-v1/parameters.json)复制目标结构的一项，给新款一个新 ID，并改可见结构尺寸。例如圆盘款可调整 `baseRadius`。发布器保存配方快照、固定生成器和素材身份。原网头、原始 Blender 文件、适配后的母件及许可随包保存。提示词描述造型，安装与几何验证由实际导出的资产完成。[作者的 CC0 许可](https://grab3d.com/license/)

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-my-vocal-mic/parameters.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-my-vocal-mic/parameters.json
```

将新资源引用放进要变更的那间房，再运行批次。若该房保证沿用已验的歌手站位，封包时须按房提供原交付的清单 SHA 和对应来源房键。接收方可从新包运行 `check-vocal-origin.mjs` 读取这间房当前的站位和拾音节点。[逐房绑定与读取方法](COMPANY-SINGING-ROOM-PRODUCTION.md)
