# M1 收尾用户链 · 77e46efb5441

固定源码摘要：77e46efb54418a1d006d972e0922b96b33a580a2d0e77211884f5df1e225e25c。真实运行固定 dist；原女裙及原男短裤分别独立新页面、各自整链无 reset/传送/advance。QA_HEADLESS=1；1440×900，动态开启、full corrections、正常1×、固定 room 镜头。

男女分别25/25原检查通过。实际装卸、走跑重选、接近椅子/坐讲、暂停恢复、持麦拒绝招手/卸麦后成功、站起、两段舞及中断、再走、附件卸下均保留。任务取消/失败按原预期记录，未改检查条件。结束active=null且mode=idle，各0 pageerror、0 cameraChanges。

| 角色 | rAF样本 | 记录窗口真实秒 | 模拟秒（包含主动暂停） | 比值 |
|---|---:|---:|---:|---:|
| female-skirt | 6789 | 42.8252 | 42.2045 | 0.985506 |
| male-shorts | 6728 | 40.8414 | 40.2796 | 0.986244 |

时钟是加载完成后轻量采样窗口，非整份视频文件时长；链内明确暂停约0.5秒，不能把比值差直接当慢放或性能失败。截图调用也属于原脚本；没有额外skin探针或性能采样。完整原片在各角色continuous-chain.webm，未截短/加速；观看页index.html。

用户已决定女性裙装按当前合入版本收尾。已知硬折、边缘与开发机成本限制保留，不再阻塞本轮M1；不表示修复，也不推定新裙/派生体/普通PC通过。普通电脑未测。这里没有新增整片连续视觉验收，visualReview保留pending，用户观感由完整原片判断。

执行脚本与common/runner/packager原字节在executed-scripts；两次初末身份门及真实body SHA在压缩原report中；chain-clock-and-terminals.json保存全部任务终态。未改runtime，临时服务与Chrome均随runner退出关闭。

复跑：设置QA_HEADLESS=1、QA_M1_BUILD=77e46efb5441、QA_M1_ASSET_SHA=027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95；运行 node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-user-chain.cjs。已存在输出不能覆盖，复跑须另设QA_M1_RUN_ROOT。
