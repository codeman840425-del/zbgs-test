# 官方 Windows SLIM core 三维 API smoke

本包按授权完成一次独立安装与固定两状态工具检查，未制作角色。全4个tet顶点都有软约束，结果只证明当前官方Windows二进制能执行3D core入口及非零响应，尚未检查内部自由点、头域、原八请求、morph/skin/衣物。

## 实际结果

- identity调用1步，最大误差0m。
- 原第4点Z目标+1mm，固定5步，实际位移0.999998332mm，最大目标残差1.6676640068880033e-9m，det1.0009999983323359，体积0.1668333330553893m³。
- 官方core使用SYMMETRIC_DIRICHLET、soft_p=1e5，V_init保持原单位tet。全部数组与实际API docstrings保存在result.json。
- 总进程墙时0.716s，脚本内0.513s，exit0，无重试或参数搜索。
- 只加载igl和igl.pyigl_core。没有调用tetgen/cgal或生成其他网格，没有GPU/browser/源码编译。

## 环境与身份

独立工具目录为 `experiments/tools/slim-core-2.6.3`，其中.venv的include-system-site-packages=false。Python3.13.11，libigl2.6.3、NumPy2.4.2、SciPy1.18.1均从本目录导入。默认全局Python复核仍无igl。

三wheel来自官方PyPI元数据URL，只下载binary，实物SHA逐个回核，再使用no-index/no-deps/require-hashes安装。requirements.lock保存精确版本与SHA；prepare-report.json保存原URL/依赖/文件尺寸和许可证证据。工具目录wheelhouse保留原归档，撤销仅需移除该专用工具目录，不更改全局Python。

| wheel | SHA256 |
| --- | --- |
| libigl2.6.3 cp312-abi3 win_amd64 | 1d91745ed0e78c56a04539e3231ce6faff49ae0dbe123caa2034e1886fcb2e7d |
| NumPy2.4.2 cp313 win_amd64 | 7df2de1e4fba69a51c06c28f5a3de36731eb9639feb8e1cf7e4a7b0daf4cf622 |
| SciPy1.18.1 cp313 win_amd64 | 559ed65f60c1af5a03f3912605a1b5114f522c7c32fb23c3376ae8f03219fe28 |

实际pyigl_core.pyd SHA为 `52463e5d6da47be05473810c3f7fffbc282afa89ec98d4dd2b17234f8f9d8397`。result.json固定三distribution全部140个pyd/dll路径、尺寸、SHA，核心入口真实docstring与调研发布源码相符。

23份wheel notice/metadata保存在wheel-notices。libigl实际wheel同时带LICENSE.MPL2和LICENSE.GPL，且安装目录含copyleft/tetgen/cgal可选pyd，本次未加载它们。不能把整个wheel当MPL-only产品包转发。NumPy/SciPy各自包含bundle许可，按实际notice保留。这里记录离线工具使用和随附声明，没有宣称所有打包模块都已完成产品商业分发审核。[官方源码与许可核查](../m2-slim-tool-readiness-v1/README.md)

## 资源采样缺口

原run.py监控只取Popen PID，实录peakRssBytes=4268032，未累计Windows venv启动器的后代进程，不能当完整solver峰值RSS或3GiB进程树限制已验证。resource-observation.json单独保留该缺口，原run.py及原run-report字节和SHA未改，未为补指标重跑。后续runner必须递归采各子进程并累计RSS及逐子进程检查。

## 重现与冻结

实际执行命令为以下两个，均已各执行一次。

```powershell
python -B scripts/m2-slim-tool-smoke-v1/prepare.py
python -B scripts/m2-slim-tool-smoke-v1/run.py
```

工具目录或回执已存在时入口拒绝复用，不覆盖本次事实。未来若需独立重现，先另行安排新目录与身份，不能用原路径反复试到通过。requirements.lock、官方归档和实际执行脚本已固定。

本次未提交主树。readiness与smoke分别保留研究时未安装、实施后实际通过的时间语义。正式角色方法及准入仍由后续独立包判断。
