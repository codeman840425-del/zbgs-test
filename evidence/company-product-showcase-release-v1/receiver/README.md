# 带货包装接收验证

将 `receive.mjs` 和 `probe-print.mjs` 放在同一目录，原稿及其生成文件放在相邻的 `receiver-art`，或通过 `RECEIVER_ART_DIR` 指定目录。脚本需要包要求的 Node 版本、npm 缓存中的锁定依赖和 Python 3。`RECEIVER_PYTHON` 可指定 Python 可执行文件。首次运行在可写的新试制目录中完成。复跑可用 `RECEIVER_EVIDENCE_DIR` 写另一路径。

```powershell
node receive.mjs mother FIXED_PACKAGE NEW_TRIAL EXPECTED_MANIFEST_SHA256
node receive.mjs derive NEW_TRIAL
node receive.mjs rebuild NEW_TRIAL [ATTEMPT_NAME]
```

第一步验证并复制母包，离线安装、构建并逐字核对 viewer 与两房原批次。第二步用包内发布入口加入印刷纸盒，只替换出租屋前台主货，保留工作室原 save 和 layout。派生包名为 `printed-carton`。该步还修改临时副本的原稿和 PNG，核对发布、离线索引检查和打包拒绝；普通房间编辑入口拒绝挡镜头的实体背景板。第三步在单独的派生拷贝离线安装，复产原纸盒与图案、重建 viewer、复跑手工替换并验证两房。脚本在 Node 内检查四条正面 UV 射线和图案实际像素。
