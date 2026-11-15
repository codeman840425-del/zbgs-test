# 当前固定候选的启动与恢复

能力状态以[CAPABILITIES](CAPABILITIES.md)为准。当前固定待验候选1a0d06fc8ffe，源码提交0ae64b83384a3ed9853185f6a008ac6b70b1e8cc。`delivery/candidate.json`保存精确目录、SHA与端口，不是第二套验收表。

- 当前交互：http://127.0.0.1:4191/ ；男性加`?body=male`并选“独立露膝短裤”。
- 当前同版正常短片：http://127.0.0.1:4174/evidence/accessory-normal-1a0d06fc8ffe/ 。完整13f男女链另标原版本，不继承为1a全链验收。
- 旧269对照仍在http://127.0.0.1:4192/ 。本轮原服务重启动作被工具策略拒绝，未停止或覆盖旧服务，新版使用空闲4191。
- 录像总入口：http://127.0.0.1:4174/evidence/m1-current-review/ 。目前3个本机服务，不是联网后端。

根目录运行`python scripts/serve-candidate.py`启动当前4191。端口已有服务时勿重复启动；脚本核完整构建身份再服务，不带热更新。证据服务是`python scripts/serve-review.py --port 4174`。

新检出没有固定产物时，切到上述精确源码提交，在prototype执行`npm ci`，再运行`npm run build -- --outDir ../experiments/m1-accessory-ui-2/dist`。已在全新独立检出实测63文件逐字节一致，见evidence/accessory-ui-rebuild-1a0d06fc8ffe。锁文件与已提交导出资源为构建输入；这不替代每类源资产重导的独立记录。

previous指针保留269源码aed9597、目录experiments/m1-joint-integrated-1/dist、完整摘要和原4192端口。历史abdb/942目录与影片同样保留。回退须使用对应固定指针/源版本，不覆盖新旧dist。

本版修复附件拒绝/失败反馈，精确镜腿仅适配原F/M；派生明确拒绝，legacy查询仅诊断。裙源实验没有合入；服装形状、连续自然度、最终画风和普通电脑性能仍分别待验，不称M1完成。
