# 当前固定候选的启动与恢复

当前 **77e46efb5441**，源码提交 `e94ac1cbb8b4d4b1c7beddba0effa62d3cfa073a`。精确目录、摘要、端口和回滚版本保存在 `delivery/candidate.json`。能力状态见 [CAPABILITIES](CAPABILITIES.md)。

- [女性当前入口](http://127.0.0.1:4195/)，[男性当前入口](http://127.0.0.1:4195/?body=male)，男性选择“独立露膝短裤”。
- [同版男女正常1×完整操作录像](http://127.0.0.1:4174/evidence/m1-close-77e46efb5441/)。
- [统一观看与历史对照](http://127.0.0.1:4174/evidence/m1-current-review/)。
- 保留4194/152、4193/f7、4191/1a、4192/269及证据4174，连同新4195共六个本地服务；均不是多人后端。

77保留038的手部接触释放与裙装实现，新增导入动作UUID隔离修复。男女各25项连续操作技术检查通过，实际4195入口核查通过。女性裙装按用户决定封板；已知硬折、局部穿插、开发机成本和普通电脑未测仍保留。整片自然度、最终画风不由程序检查代替。

根目录执行 `python scripts/serve-candidate.py` 启动4195；已在运行时勿重复启动。服务核完整构建身份，不使用热更新。证据服务：`python scripts/serve-review.py --port 4174`。

在新目录恢复固定版本：

```powershell
git checkout e94ac1cbb8b4d4b1c7beddba0effa62d3cfa073a
cd prototype
npm ci
npm run build -- --outDir ../experiments/m1-motion-identity-integrated-v1/dist
```

源码提交早于发布指针提交；构建后回到保存77指针的交付提交，再从根目录启动服务。或在该固定dist目录执行 `python -m http.server 4195 --bind 127.0.0.1` 直接观看（没有候选身份响应头）。先确认端口空闲，不覆盖历史dist。

已实际在新检出中执行锁定依赖安装/构建，65个输出字节全部一致，见 `evidence/rebuild-77e46-e94ac1c/report.json`。这是已提交源码及导出资源重建，不冒充全部Blender源重新制作。

回滚指针：`delivery/candidates/152b17a0c6e9.json`；旧固定目录和4194保持原样。视频动作唯一派生单独封存，不在77默认动作清单内。私人真人参考/供应商原FBX只在本地归档，不属于公开远程重建输入。
