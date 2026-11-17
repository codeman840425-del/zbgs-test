# FaceContour 两体适配准入审查

审查脚本为 `scripts/production/qa_native_batch_adaptation.py`，输入固定女性几何基线和 `assets-source/native-parameter-game-packages-v1` 的两个最终 `body.vrm`。脚本不启动编辑器、不运行浏览器、不写运行时。输出数据 SHA256 为 `a0806956cfdad46d6f2704a2bd0aceb149b39ffbb14b91fc9aed7adb7feaa636`。

## 可复用部分

两个身体的 `nodes`、`skins`、VRM humanoid、表达定义和 `VRMC_springBone` 与基线逐字段相同。每个候选都有 27 个 spring、28 个 collider。由此可以复用已有 normalized-motion 和 spring 配置的结构与资源边界。该结果只覆盖结构身份，发际几何随 FaceContour 改变，头部挂接、表情动作、发际接触仍需逐身体运行检查。

两个身体的 Body 材质均为 `N00_000_00_Body_00_SKIN (Instance)`，base 与 MToon shade 共同消费 image 11，UV0 和纹理变换保持 identity。完整身体贴图与 `native-tops-body.png` 均为 2048×2048，RGB 逐像素相同，完整身体 alpha 全 255，遮罩有 608383 个 alpha 差异。基础贴图 SHA 为 `5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a`，遮罩 SHA 为 `dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c`。这部分可复用现有 body-texture coverage admission 的准入方式。

## 逐身体复核

| 候选 | body SHA | dynamicMotion | surfaceAndTexture |
|---|---|---|---|
| `contour-roundness-a` | `825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547` | 结构可共用，需复核 HairBack | 身体像素合同已核，脸/口腔/Body/后发表面需复核 |
| `contour-cheek-b` | `9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb` | 结构可共用，需复核 HairBack | 身体像素合同已核，脸/口腔/Body/后发表面需复核 |

现有依赖差分报告显示，两体均只因 `HairBack` 几何而把动态动作标为重新检查。FaceMouth、Face、HairBack 和 Body 法线的实际变化仍会影响表情、头部挂件、麦克风口端和近景材质。因此没有把候选标为动态或完整表面通过。

## 仍缺的证据

- 每体正常速度眨眼、口型、情绪、视线、走停转向、坐起和短舞中的后发与脸部接触。
- 每体眼镜镜腿、耳饰、麦克风目标位置及其卸装恢复。
- 游戏加载时的 MToon 材质、Body coverage 切换、关闭重开和双实例资源释放。
- 普通电脑加载和运行成本。当前静态 body/material/image 数量与历史 CPU 读回不能替代浏览器性能证据。

复现命令为 `python -B scripts/production/qa_native_batch_adaptation.py`。重复运行需先移走已有输出 JSON 到独立归档目录，脚本故意拒绝覆盖已有证据。
