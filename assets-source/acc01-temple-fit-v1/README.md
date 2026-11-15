# ACC-01 镜腿局部适配候选（未合主）

修复对象是既有 `studio-glasses-v1.glb` 镜腿穿入男女原基模头侧。保留完整原资产、镜框、鼻桥、铰链、拓扑与材质；只对两个镜腿的四个横截面进行版本化位置/朝向变形。不是新造眼镜，也不是通用头型自动适配。

## 身份与范围

- 基于恢复提交 `aed9597da5fc24c19f232af4f6da62be9d9e61c3` 的隔离 worktree `experiments/acc01-fit-worktree`。
- `de62b993e5e3`：四姿真实最终蒙皮门、房间 1× 原片、加载错误与取消证据。
- `b345c573aee3`：唯一新增产品差异是未配置身体由静默原形改为明确拒绝；真实 jaw 默认拒绝/显式 legacy 对照、男女原体成功。没有改配置或变形算法。不重标 de62 原片为 b345。
- 原女/原男精确 SHA 各自一个 profile。派生没有 fit，默认拒绝。`?glassesFit=legacy` 仅同版诊断。
- `portable/manifest.json` 区分原 Git blob、正规化 LF、实际候选 bytes 哈希；不得整文件覆盖新主线。

## 可编辑源与重建

环境见 `environment.json`。使用 Python 3.13.11；在仓库根执行：

```powershell
python -m pip install -r assets-source/acc01-temple-fit-v1/requirements.txt
python assets-source/acc01-temple-fit-v1/scripts/build-temple-profile.py
node assets-source/acc01-temple-fit-v1/scripts/qa-temple-profile.mjs experiments/acc01-fit-worktree
```

生成器读取被跟踪的原 `prototype/public/assets/m1c/studio-glasses-v1.glb` 与 `input-269/` 原始最终姿态捕获；先核源和四个输入字节 SHA。算法/有限边界直接保留于脚本，输出 `generated/{female,male,manifest}.json` 和离线形状。已在当前环境重建，三个发布配置逐字节相同，见 `rebuild-receipt.json`。未来改控制点应重新生成 profile SHA/registry 与实际验证，不复用旧形状身份。

当前目标选择是精确源族耳 patch 的外轮廓最高点（x>72mm、z<−65mm 的显式局部选区），不是耳与头连接的上沟。较明显上斜及最大顶点移动 37.8/40.9mm 必须审美复核，不称微调或自然佩戴已通过。

## 最小移植

只审 `portable/live-presentation.patch` 三局部 hunk，并复制 manifest 列的四个文件。helper 精确校验身体/附件/profile/原镜腿 POSITION，逐实例 clone，两个镜腿准备完成后原子替换，不引入逐帧变形成本。失败清理使用原 `setAccessory` 生命周期。需要先审当前主线差异，不自动覆盖。

## 回归入口

以下从仓库根运行，QA 仍复用项目现有 `run-fixed-check`/`qa-m1-common`。脚本中的独立 helper 验证使用真实 GLTFLoader；只替换 Node import 路径及内联同一 manifest。

```powershell
$env:QA_M1_BUILD='b345c573aee3'
$env:QA_M1_RUN_ROOT='output/playwright/m1/b345c573aee3/acc01-new-run'
node scripts/run-fixed-check.cjs experiments/acc01-fit-worktree/dist-acc01-v2 assets-source/acc01-temple-fit-v1/scripts/qa-acc01-unsupported.cjs
```

`qa-acc01-capture.cjs` 是四姿几何/静图；`qa-acc01-normal.cjs` 为同版男女旧新 room 真实 1×，不可并发重任务；`qa-acc01-loader.cjs` 检验 HTTP/哈希/取消/销毁。几何诊断：

```powershell
python assets-source/acc01-temple-fit-v1/scripts/qa-acc01-diagnose.py <四姿输出目录> assets-source/acc01-temple-fit-v1/generated
```

诊断复用被跟踪的 `scripts/m1-assets/qa-layer-rest-triangles.py` 有限非共面三角相交函数。省略第二参数只用于原形中心线，不能拿旧中心线分析新形状。完整原片/报告见 `evidence/acc01-temple-fit-v1/RESULT.md`。没有目标设备性能通过、近景连续观感通过或所有派生兼容声明。
