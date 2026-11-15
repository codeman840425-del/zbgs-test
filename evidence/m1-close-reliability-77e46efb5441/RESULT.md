# 77 固定版收尾可靠性补验

固定 `77e46efb5441`，仅执行 tasks、tasks-mm、peer、restore、lifecycle，串行、无录像，未重做用户整链/招手/服装视觉矩阵。总体为**部分完成，后台生命周期未通过**。

| 项目 | 实际结果 |
|---|---|
| 男主 + 女 peer 任务/同椅 | 19/19 检查通过 |
| 男主 + 男 peer 任务/同椅 | 19/19 检查通过 |
| peer 延迟加载、取消、503、重试 | 通过；原主实例保持，未ready角色不进入显示场景 |
| QA 本地记录 v2 关闭页再恢复 | 男女2例通过，26项坏身份/配置拒绝且状态不变 |
| 真实后台/返回前台 | 未通过：只有 trusted hidden，没有返回 visible |

任务门包括真实坐起、椅子保留/竞争、取消释放、超时、重复请求仅一个终态，详情不以单一截图代替。各实际报告 errors 均为空。保存恢复仅 QA localStorage 合同，不是已实现正式游戏存档/服务端同步或自动迁移。

## 初次 QA fixture 失败与限定修正

匹配源摘要通过后，旧 catalog 的 styleMap 不认识 `m1-uniform-skirt-open-waist-v1`，初次生成失败。实际资源 SHA `a5de096be20211ea9a875434893fff6c9d37b25b58cacc27c9bd8d7b8c772d66`、412688 字节与77 manifest相符。仅为生成器新增独立 `qa-style:female-uniform-skirt-open-waist-v1` 映射，未别名旧裙；SHA/字节/身体/slot/raw-bind门保留，随后全部通过。初失败和原生成器快照保留，旧 schemas fixture 未覆盖。

## 真实后台失败边界

本轮 Playwright 1.58.2 采用原有 headed 同context第二标签页方法、关闭driver focus override，未合成或覆盖 visibility。`beforeBackground` 已 hidden；`hiddenStart`、`hiddenEnd`、`returned` 也始终 hidden。唯一原生事件为 trusted=true/hidden=true，模拟时钟各时刻均约 .134500000119 秒。说明实际隐藏时模拟保持，但没有建立真实返回前台，不能断言产品前台恢复失败或通过。

脚本在 `trusted native visibility` 断言停止，保留失败，未放宽、未重复。后续明确暂停、resize、三次换装/peer复用和20秒smoke未执行，不能继承旧版本通过。临时服务已随失败退出，浏览器finally关闭，无常驻监听。

## 身份及复跑

实际浏览器资源来自 `experiments/m1-motion-identity-integrated-v1/dist`；fixture精确匹配源为 `experiments/rebuild-77e46-e94ac1c/prototype`，输入摘要已离线重算核对（matching-source-receipt.json）。任务报告 start/end 为测试期间当前共享文件未变化的记录，**不是77构建输入身份**。

```powershell
node scripts/build-avatar-record-fixture-v2.mjs experiments/m1-motion-identity-integrated-v1/dist --source-root=experiments/rebuild-77e46-e94ac1c/prototype --out=evidence/m1-close-reliability-77e46efb5441/catalog.json
$env:QA_M1_BUILD='77e46efb5441'
$env:QA_M1_ASSET_ID='beta-base-female-m1'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_M1_RUN_ROOT='F:/gamemake/output/playwright/m1-close-reliability-77e46efb5441-rerun'
$env:QA_RECORD_CATALOG='F:/gamemake/evidence/m1-close-reliability-77e46efb5441/catalog.json'
node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-final-user-sequential.cjs --stages=tasks,tasks-mm,peer,restore,lifecycle
```

执行脚本快照与报告/日志均归档；复跑必须使用新输出目录。无产品源码变更，无性能或普通电脑通过声明，无视觉自然度结论。
