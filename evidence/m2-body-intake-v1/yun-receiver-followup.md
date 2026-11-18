# 云岚接收复核

云岚已在融合工程的登记副本构建 `102344d95ee237d4137c4ecbe5f414bc5c87b149600573f38a6828964c479e70` 通过单角色双冷开。范围为实际游戏消费入口、装备及 idle。正式发行工具仍拒绝该构建，Mouse Pad 1.1 正式座位链仍未接通。本次在角色工程只读核对原件和回执。[前次来源核查](new-family-receiver.md) · [双冷开报告](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-game-cold-r02/report.json)

## 输入与来源

| 输入 | 实算 SHA-256 |
| --- | --- |
| 原 VRoid 工程，5,664,076 B | `352fbefb90dda9e6af602f71391050b13222b6fd02a62369ecf10a1b74d957cf` |
| 原着装导出，15,255,820 B，与正式重开后重导字节相同 | `7aa4242c8575d68b84fd23b32a7b525519ef4c7ec5d569807016dd9b21824154` |
| 本人原生移除上衣后的参考导出 | `9571d94682c633a5a04145678b04657da6aac61407ea57b362cae59382baf3ce` |
| 同源完整皮肤供体暨登记身体 `native-studio-01-yun-lan-v1`，16,015,956 B | `bedc5970d9a248aa5870f3bfa6f3413736637db571846622ec4cf154c80a31a1` |
| 原上衣 Body 遮罩 PNG，824,472 B | `042b69e372bfdbf3a1dd7e897d82bc3f689e652a14f63f6cdb23f4bffe5c32e7` |
| 独立上衣／短裤／鞋，各绑定上述身体 | `3fd3a0eb0f677018bdb8f35abbdcb4d743bd9a75c58ae4023935278db272c5ef`／`1a1ac4c13e1ffa68083455f319fd1f7ef250a4734498e8e299f1a3c3934e3add`／`014286a8766091936e72b8826720865714773e8bb2cc6e68b8d0a632c2c76bad` |

原件、制作批回执、去衣参考原件及回执、包内来源和固定目录响应资源的哈希均相符。参数 `Level2FaceContour_ChinRoundness=0.21`。去衣原生参考提供同名、同尺寸、RGB 相同且全不透明的 Body 图，原导出的 1,020,687 个非全不透明像素用于保留上衣遮罩。包回执记录保留 146 个原 accessors，独立服装属性和逆绑定精确。前次旧女性模板 Body 拓扑拒绝仍成立。[原件目录](/F:/gamemake-test/native-studio-round/characters/studio-01-yun-lan) · [供体回读](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-native-top-reference/pixel-preflight.json) · [包来源](/F:/gamemake-test/native-studio-round/registration/operator/received/batch-yun-original-r01/packages/studio-01-yun-lan/provenance.json)

直接读取原 VRM 元数据得到作者 `Internal VRoid studio study`、`onlyAuthor`、`personalNonProfit`、`creditNotation=required`、`allowRedistribution=false`、`modification=prohibited`。装备条目记 `internal-study-only`。本地条款记录源自 VRoid Studio 内置基底、脸部、发型和套装，用于本地制作及测试。本次文件中未见覆盖实际对外用途的许可记录。[接收时保留的素材条款](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-registered-complete-body/terms-ASSET-TERMS.md)

## 运行和发行证据

- 单记录文件 SHA-256 `2a7f8fd39a38ddf8bf77e148833ae90d3de040deaca2fd13c821623a708ce2b8`，与固定候选存档及双冷开数组里的对象一致。记录 ID 为 `batch-native-studio-01-yun-lan-v1-f580eee2cc9f`，revision 1，记录自身 SHA-256 `5a9741a2425caebb71acad1693314ecb0b9f1abbc4cb7e38d8a676e739f9fcc8`。两独立 Chrome 进程分别用 `record-consumer.html?production=1` 的 `selectGroup(0,[record])` 完成恢复。根、VRM、头骨实例各自新建。两次各前进 121 渲染帧（53→174、47→168），实际 idle 骨骼变化，页面无错误。两次均观察到七个指定资源的 HTTP 200，报告用同固定 URL 的独立 GET 取哈希，已与实际固定文件核对。[单记录](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-game-record-r02.json) · [报告执行脚本](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-game-cold-r02/executed-driver.cjs)
- Gate 的九个 lanes 均为 `verified`，角色在 `acceptedForRuntime` 中，`adapterTaskCount=0`。该版底层顶层 `adapter-work-required` 为固定值，外层实算 `ready`，`runtime-admitted` 计划接收 1 条。计划明确省略没有唯一精确适配的麦克风和眼镜。[Gate](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-game-cold-r02/gate.json) · [Cycle](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-game-cold-r02/cycle.json)
- 正式外部记录打包实际返回 `unsupported-build`，理由为 `No repository review for selected game runtime`。本仓当前评审索引没有该完整摘要。融合侧从本地快照 `88873dfc54be8fe2a3fe4bc401409c871e4649e4` 独立复建，评审工具对 11 个入口可达文件给出逐字节相同结果；快照另携带 Vite 实际导入、原 build-info 输入清单遗漏的 `assets-source/variant-matrix-v1/representative-batch-request.json`。候选审查文件尚未进入正式索引。[拒绝回执](/F:/gamemake-test/native-studio-round/registration/yun-fixed-102344d95ee2/official-distribution-rejection.json) · [复建清单](/F:/gamemake-test/native-studio-round/registration/yun-fixed-102344d95ee2/source-inventory.json) · [评审索引](../../scripts/runtime-package/game-runtime-reviews.json)
- 原导出和登记体在现有静态预算中均有五项超限。登记体为图元顶点 97,242/80,000、关节槽 291/256、RGBA8 mip 估算 137,364,488/100,663,296 B、弹簧关节 56/32、碰撞体 22/16。当前证据未覆盖普通电脑、完整动作/接触或人眼验收。[登记体 intake](/F:/gamemake-test/native-studio-round/registration/operator/received/yun-registered-complete-body/intake.stdout)

## Mouse Pad 1.1 的座位接缝

`yun-env11-r01` 固定环境摘要 `d7e1fde3bf8c642ffc5bb09512858ab248ff51515fcff5f73adc1ce5dc208d00`，公司场景文档 `mouse-pad-home` revision 2。公司侧的 `mouse-pad-home/ground/live/station-1/chair#seat` 已取得真实接触句柄（座面 1,764 顶点）并释放，角色侧也完成同一记录恢复。不过两边分别开页，使用点在角色场景中查找为假，游戏 consumer、角色实例和控制器三个 `requestBehavior` 均为 `undefined`。正式调用停止于 `TypeError: target.requestBehavior is not a function`，没有入座响应或人物接触数据，环境原清单前后哈希相同。接缝按实际使用点绑定角色任务、租约及座面，继续验证接近、坐稳、起身离位和释放。[公司接触](/F:/gamemake-test/native-studio-round/official-pair/evidence/yun-env11-r01/company-contact.json) · [角色真实恢复](/F:/gamemake-test/native-studio-round/official-pair/evidence/yun-env11-r01/actual-role-restore.json) · [失败请求](/F:/gamemake-test/native-studio-round/official-pair/evidence/yun-env11-r01/role-request.json) · [现有接口约定](../../docs/CHARACTER-COMPANY-C3-SEAM-2026-11-16.md)

## 正式复现顺序

1. 先固定以上来源、供体和记录。复核当前实测可直接使用已登记固定候选。若需重做包，在项目内隔离的操作器目录依次运行原生 `runner.py`、`prepare_native_batch.py`、逐角色 `native_body_package.py`、`native_import.py`、`register_native_packages.py --group female`。使用云岚同源配置和原回执的导出设置。游戏从已登记的精确源码与完整输入独立构建，包含额外的实际 Vite 导入。[原配方和具体入口](/F:/gamemake-test/native-studio-round/registration/README.md)
2. 已固定构建可用以下命令复核消费或重做同配方 D02。两次冷开用原记录比较同一完整哈希。重做 D02 时单独保存新记录，创建时间进入完整哈希。命令从 `F:/gamemake` 执行，`$out` 指向工程内已创建的独立复跑目录，子输出须为新路径。归档冷开脚本还会读其原操作器的 build-info，适用于此精确构建。

   ```powershell
   $reg = 'F:/gamemake-test/native-studio-round/registration'
   $dist = "$reg/yun-fixed-102344d95ee2/fixed-dist"
   $record = "$reg/operator/received/yun-game-record-r02.json"
   node scripts/run-fixed-check.cjs $dist "$reg/qa-yun-single.cjs" $record "$out/cold"
   node scripts/character-production-cli.cjs --dist $dist --request "$reg/operator/received/yun-create-r02/request.json" --out "$out/yun.new.record.json"
   ```

3. 在项目内隔离操作器中保留包内相对路径和真实回读报告，用 `native_admission_cycle.py --batch <import-batch.json> --runtime-report <report.json> --gate-output <新gate.json> --records-output <新计划目录> --summary <新cycle.json>` 复验。正式发行前用 `review-game-runtime.mjs <固定dist> <独立复建dist> <干净源码检出> <新评审文件>` 复算并审查源码及运行时依赖；候选评审入正式索引后，再用 `game-record-cli.mjs inventory --dist <固定dist> --source-root <精确源码> --records <原记录数组> --out <新inventory.json>`，并以相同输入、同份 `--inventory` 运行 `export` 到新目录。对应许可、静态超限及普通机/观感证据见上。
4. 公司正式联动使用同一固定角色记录和上面的环境清单。实际接缝就位后，按 `yun-env11-r01` 的使用点复测，记录角色收到请求、持有实际座面、入座接触、起身真实离位和释放。另保留未知或失效使用点的拒绝证据。当前回执记录到三个入口均未暴露行为方法的位置。
