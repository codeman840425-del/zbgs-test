# 局部裙上层过渡：隔离运行源码

此检出从f70c220运行接入检查点开始，只把显式`?skirtSample=layer1`分支的裙源替换为已保存的layer-transition-v1。默认入口仍使用原裙，不是公开269替换。

- 固定构建：58394ce674e4；生成目录dist-layer1-linked。目录不纳入Git；通过锁定依赖重新构建。
- GLB：d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa。
- 源工程/重复生成/四姿门：origin/codex/simple-skirt-v1提交3822772e92692f27249521529770e07a003a8aee中的assets-source/m1/simple-skirt-v1/layer-transition-v1。
- 原120面/20点接缝不变，新源适配身份独立；上衣使用原open-hem文件，绝对URL保留其路径，未修改其几何。
- 首次0b729ed03491集成遗漏相对open-top URL基路径，导致真实HTTP404。已修正；失败图与报告保留在主线evidence/skirt-layer-58394ce674e4，不改写失败构建。

在prototype执行npm ci，再npm run build。浏览器检查使用主线scripts/qa-skirt-layer-static.cjs和run-fixed-check.cjs；明确设置QA_M1_BUILD、QA_M1_ASSET_SHA，并传入layer1和新的输出路径。该检查只运行静止姿势，不证明动画与坐姿通过。

主线evidence/skirt-layer-58394ce674e4保留同姿、同四镜头实际GPU前后图：前腹露片消除；右臂接触按新裙重新求值，其余raw骨矩阵一致。后视裙面被椅背遮挡，不作为完整背面验证。原细褶上带与平滑下摆的风格差异仍在，连接折角风险与坐姿严重交叉未通过，不允许凭本检查将新裙正式准入。

没有改变人体动作、世界位移、更新频率或接触阈值。新装备坐姿作者响应将在原制作分支继续，完成后需独立固定构建与完整动作回归。
