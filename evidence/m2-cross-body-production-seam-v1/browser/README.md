# 两套裤袜的固定浏览器回读

这是数字索引选择的基线。固定源码 `7326b34e564aa1c8a7f58ffc43bb91078039a22f`，构建 `8b41452b51c7`。D02 实际执行两个已核对的诊断请求，原女性索引 3，原男性索引 7。两份 rev1 的身份、身体、装备 ID、槽位及 SHA 均对应各自输入，袜适配分别校验指定裤和鞋。计划仍有 0 项正式准入。[输入与记录核对](record-check.json)

| 角色 | 裤装 | 独立袜适配 |
| --- | --- | --- |
| `pants-socks-female` | `m1-training-pants` | `female-original-plain-crew-socks-fit-v1` |
| `pants-socks-male` | `m1b-uniform-pants` | `male-original-plain-crew-socks-fit-v1` |

独立包复用已审定运行时，位于 `experiments/m2-cross-body-pants-socks-game-v1`，含 43 个清单条目和 `runtime-package.json`。启动本地静态服务后打开 `record-consumer.html?records=/records/manifest.json`。清单 SHA256 为 `34c619e4293f0a0d705aeec0320bfef35662ddb2ec01541015a4c4687f7c4dad`。[独立包清单](inventory.json)

Chrome 157 在开发机实际请求了两具角色各自的上衣、裤、鞋、袜 GLB。关页重新打开后产生新的两个实例，原记录 SHA、完整配方、道具及材质都一致。重复查询参数和错误记录清单被拒绝，页面没有回退到内置示例。正常速度同场片解码 255 帧，时长 8.466 秒。[资源请求核对](package-verification.json) · [浏览器报告](package/report.json) · [1× 录像](package/produced-pair-1x.webm)

原女性源体的长袜色块仍可见，原男性长裤遮住大部分袜层。此处确认装备身份和读回，服装接触和普通电脑性能待验。[截图](package/produced-pair.png)
