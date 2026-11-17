# Waist完整皮肤与三衣覆盖输入

本包仅绑定真实Waist基体 `cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5` 和 `native-vroid-waist-factory-equipment-v1` 的三衣。没有注册runtime/public/UI，没有Studio/GPU操作，不继承Face或旧843ac的fit通过。

原生Waist导出22448的实际Body PNG逐字节等于已验证dc375 Top mask。完整基体的Body图等于843ac原生完整皮肤donor；整图RGB与mask一致，608383像素仅alpha变化。实际Body索引、UV、JOINTS/WEIGHTS相对原女性一致，采样为UV0/identity transform/LINEAR/REPEAT，Body base/shade共同消费同图且无其它材质消费者。Body本身1149顶点已有真实腰部变化（最大欧氏2.856mm），不能由UV相同推断几何未变。遮罩复用有当前原生Waist导出依据，不是依据图像索引或猜宽松隐藏范围。

`manifest.json`沿已有native-body-texture-coverage-v1，只top启用遮罩，bottom与shoes不启用；三件均required，ID、SHA、compatibleAvatar均来自Waist自己的真实equipment entry。构建时再次读取三件GLB所有原attributes/indices及本源130骨顺序、IBM、binding名字与矩阵。保留腰部自身已改变的衣物/辅助骨依赖，原包动态归一化微差和接触未验不被本包改为通过。

`measure-floor.mjs`每次构建用现安装Three187/VRM3.5.5官方加载器读取此Waist源，纹理解码仅CPU占位。600个实际鞋索引得到raw POSITION最低 `-7.442453409112204e-8 m`；rest实际蒙皮再matrixWorld最低 `-8.449510756150829e-7 m`，源索引6988。与Face数值相同是本源实测结果，未复制旧结果。`profile-candidate.json`将runtime rest用于sourceFloorY，raw另记；不是动作地面接触或shader轮廓膨胀验收。

恢复/重建命令（项目根目录）：

```powershell
python -B assets-source/native-vroid-waist-body-texture-fit-v1/build.py
python -B assets-source/native-vroid-waist-body-texture-fit-v1/build.py --check
```

全部输入SHA在spec.json固定；整批先生成并预检，现有文件不同则报错，不覆写或静默重pin。JSON从首版固定UTF-8无BOM、LF、末尾换行，`.gitattributes`禁Git换行转换；重复build和--check实际保持bytes与mtime。末项输出冲突时没有其它写入；错source SHA实际拒绝。证据 `evidence/native-waist-body-fit-v1/result.json`。已有输出有差异应保失败并定位，不能删除证据后强刷。

首次计划误把base显式texCoord0与shade省略texCoord的原JSON要求相同，实际两者默认UV0且KHR变换都identity；该前置失败无输出，脚本及失败记录保留。修为核有效UV/变换并保原metadata，不改任何源。源许可meta与mask血缘在source-lineage.json；仅内部技术样件，不扩大原许可或玩家导出权限。

下一步由root为此新SHA登记manifest、原色策略、固定staging，再实际走共同覆盖/换装/恢复及游戏近景与动作接触。本包不以数据生成成功宣布这些环节通过。
