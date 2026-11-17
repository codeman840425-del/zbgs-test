# 原生VRoid导出后房间检查准备

入口为 `scripts/qa-native-vroid-study.cjs`。本轮只执行prepare、打包和输入拒绝检查，浏览器/GPU/录屏次数为零。真实VRM尚待导出，request-template.json中的model.path、model.sha256保持null，执行入口会在创建浏览器或运行目录前拒绝未填写输入。

prepare固定当前4196 build83decd027116及源码bfde7d79bc6bce4eda42d3d06d870364f3f64818。bundle通过git show读取该提交实际motion-source、motion及传递依赖，package-lock与本地安装锁需一致。原VRoid .vroid与保存重开readback身份已填入模板。完整脚本、bundle与来源SHA保在prepare-report.json。

真实文件取得后，在新JSON副本填实际repo-relative VRM路径及64位小写SHA，保持nativeSource、nativeReadback和固定版本身份。然后在root安排的浏览器窗口运行。

```powershell
node scripts/qa-native-vroid-study.cjs --run FILLED_REQUEST.json NEW_OUTPUT_DIRECTORY
```

准备入口可在新目录重做。

```powershell
node scripts/qa-native-vroid-study.cjs --prepare NEW_PREPARATION_DIRECTORY
```

真实执行会核VRM0/1扩展、GLB完整长度、源SHA，拒绝没有明确依赖清单的外链图像/缓冲。候选经实际GLTFLoader、VRMLoaderPlugin及rotateVRM0加载。VRM0的normalized局部XZ转换由已有motion-source根据metaVersion处理。候选的scene旋转与脚底偏移独立建立，避免把原VRM0的旋转/地面常量套给新VRM1。

sourceFloorY为有限数时按明确输入处理，为null时测候选所有可见rest顶点最低Y并只平移一次，报告保测量方法及原bounds。该最低点是否对应实际鞋底仍需观看。模型缩放保持1，重定向按group实际ground与候选normalized hips求比例。现有motion对Shoes材质名及足部skin权重的校准结果会完整记录，源命名不同导致的fallback需要据报告检查。

加载后的站立、正常速度行走使用固定版本createMotion及候选自身normalized骨架，随后调用vrm.update映射回raw骨。Phaser路径和walk任务仍由当前原女primary提供轨迹，候选group跟随该root。当前房间renderer、光照与相机共用，源嵌入衣服全部保留显示。脚本标记临时候选并保存候选SHA、版本、材质/骨名称、站立/行走帧与normal1x.webm。blink/happy/aa/oh按实际导出表达检查，缺少项记gap。

完整loadFoundationAvatar现由foundationProfile精确URL/SHA及M1装备、coverage等配置约束。此临时入口尚未经过候选foundation/equipment/appearance/live factory，也没有新Body碰撞、手/前臂/持物、发型/配色准入数据，完整换装和配方保存恢复仍待接入。当前旧primary的任务completed与候选动作采样各自记录，不能将旧人物任务结果当作候选完整接入通过。

现有qa-source-proportioned-face入口只做静态pose叠加，本入口追加了候选自身的实际重定向和createMotion。尚无真实新VRM执行，画面、足底、动态、表情和正常动作结论均待实际证据。
