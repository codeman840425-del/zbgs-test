# 从训练房布置舞播机位

沿用训练房的实镜、背景、活动区和入口。给房间放入承载桌，在桌面安装有实体镜片的相机。房间配方使用米制局部坐标；桌面和镜片会随房间一起转动。可直接修改[出租屋和楼层训练房的配方](../../scripts/company-platform/batch-inputs/dance-broadcast-rooms.json)。

在已有 `trainingClearance` 下用 `shot.cameraId` 和 `shot.backdropId` 引用本房的相机与背景板。`shot.frame` 用 `start`、`end` 两个 [x,z] 点确定横向活动线，用 `bottom`、`top` 确定画面要容纳的最低和最高位置。四角组成一个连续的拍摄面。在物理空间中允许活动的范围仍由 `activity` 定义。接近相机时，即使地面仍可站人，也可能拍不全身。

生产检查从已安装的 GLB 镜片出发，复用查看器的镜头方向和视角。按 16:9 画幅投影拍摄面的四角，再将前景三角面逐一与这段视野相交检查。错转镜头会定位到相机，前景遮挡会给出物件与网格。部分透明材质按可见几何保守处理。另从相连公共区经指定门口向拍摄线中点检查宽 0.50 米、高 1.90 米的进场通路。普通训练房继续沿原活动区规则检查。角色身材、舞姿和动作由角色系统验证。

| 样本 | 布置 | 使用方法 |
| --- | --- | --- |
| 出租屋舞播间 | 镜面、背景和桌面相机分开布置 | 从客厅经西门入场，在配方指定的位置横向移动 |
| 楼层舞播间 | 训练层保留大镜和条板背景，桌面相机朝北 | 从公共走廊进入，镜头避开南门 |

检查还从镜片穿过拍摄面 65% 高度，在横向 40%、50%、60% 三处读取后方首先看见的实物。中央与至少一个侧点必须落在指定背景上。报告记录实际命中部件和坐标。

人类验收时在对应房间点「机位取景」。工具栏位于画面上方，点「房间全景」可以返回。画幅随预览区域的实际宽高比调整。接收方可以在副本里替换单件、修改相机或活动线，再批量生成。存档保留原配方与版本，单独移交的房间也可以用包内 `edit.mjs validate` 复核取景。录制和发布输入均应选新的输出目录。

```powershell
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/dance-broadcast-rooms.json output/dance-broadcast/rooms
node scripts/company-platform/test-dance-shot.mjs
node scripts/company-platform/test-dance-broadcast-rooms.mjs output/dance-broadcast/four-themes
```

最后一条命令将两种舞播房、唱播工作室、酒店访谈间和出租屋带货间的原始声明写成同一份 `theme-batch.json`，再用标准批量入口生产五个独立布局。一次交付可用现有 `package-company.mjs --room` 命名每间房。每间保留自己的部件身份、层级、状态、用途检查及发布来源。舞播的固定取景检查、访谈间的座位通路、唱播的口眼站位和带货间的商品视线分别随房间复核。
