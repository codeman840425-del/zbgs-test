# 男短裤源重导：已执行175提交恢复验证

2026-11-14更新：以下最初67bf8f7计划保留为历史。实际从新归档提交 **1b1da8119c8f616c4b198a85bf004ee4b7959382** 建立独立检出 `experiments/rebuild-1b1da81`，`npm ci`和build成功，生成175a487d5ea3且55个产物与原固定版逐字节一致。随后以固定Blender4.5.9执行保存源`--reuse`两次导出、repack、audit，原blend SHA不变，两导出同67d4bde…，回封短裤仍c8a1afd…；实际新检出房间加载长短裤并坐起，有限椅盒顶点采样无命中。该过程没有修改源几何，证明已保存源可重复导出，不冒充一次新的几何编辑。

证据与全部hash：[新检出回执](../evidence/rebuild-1b1da81/receipt.json)。固定工具来自已有本机Blender安装，版本/命令已记录；不是依赖未记录的临时源素材。最新未提交abdb材质候选仍需另行归档/重建，不将175证明直接改标。

---

# 男短裤原编辑源隔离导出计划（尚未执行）

本次只准备命令，未创建 worktree、未执行 Blender 或重生成资产。按 `scripts/production/flow.py dry-run male-shorts` 复用已存在的 **`--reuse`** 路径，不调用会覆盖源 blend 的 `build-shorts.py` 或无 `--reuse` 保存流程。与材质 v4 诊断独立：着色器模块并不写回短裤 GLB 或这个源 blend。

读取时当前 Git HEAD 为 `67bf8f764973e9adb51e0b2c0646f05db3e1ca2a`；短裤源、save/repack/build 脚本、男体 spec、装备 manifest 对该提交没有工作区修改。准备基于这个明确提交建立隔离检出，不继承之后自动变化的 HEAD。目标若已存在应换一个新名字，不能递归覆盖或删除。

后续拿到生成窗口后，在 PowerShell 从主仓库执行：

```powershell
$shortsWorkspace = 'F:/gamemake/experiments/shorts-reuse-67bf8f7'
if (Test-Path -LiteralPath $shortsWorkspace) { throw '目标已存在；先查看，不覆盖' }
git worktree add --detach $shortsWorkspace 67bf8f764973e9adb51e0b2c0646f05db3e1ca2a
if ($LASTEXITCODE -ne 0) { throw '独立检出失败' }
```

生产 CLI 尚未纳入该提交，不能假设新检出含有它。需要只复制已审查的这两份入口文件（不是整个当前脏工作区），并记录各自 SHA；之后其 `ROOT` 将自然解析为隔离工作区。

```powershell
New-Item -ItemType Directory -Path "$shortsWorkspace/scripts/production" -Force | Out-Null
Copy-Item -LiteralPath 'F:/gamemake/scripts/production/flow.py' -Destination "$shortsWorkspace/scripts/production/flow.py"
Copy-Item -LiteralPath 'F:/gamemake/scripts/production/workflows.json' -Destination "$shortsWorkspace/scripts/production/workflows.json"
Get-FileHash -Algorithm SHA256 "$shortsWorkspace/scripts/production/flow.py", "$shortsWorkspace/scripts/production/workflows.json"
Set-Location -LiteralPath $shortsWorkspace
python scripts/production/flow.py validate male-shorts
if ($LASTEXITCODE -ne 0) { throw '导出前源/绑定回读失败，勿继续' }
```

Blender 在忽略目录，不复制约百 MB 工具，也不把主区工具路径误当输出目录。用已安装固定 4.5.9 的绝对 exe，传隔离检出脚本的绝对路径；该 Python 脚本自身 ROOT 根据其位置决定，输出只会去新检出。

```powershell
$shortsBlender = 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe'
& $shortsBlender --background --factory-startup --python-exit-code 1 --python "$shortsWorkspace/scripts/m1b-assets/save-shorts-editable.py" -- --reuse
if ($LASTEXITCODE -ne 0) { throw 'Blender重开/重复导出失败；保留候选和日志' }
python scripts/m1b-assets/repack-shorts-editable.py
if ($LASTEXITCODE -ne 0) { throw '骨架/材质回封失败，勿发布' }
python scripts/m1b-assets/audit-shorts.py
if ($LASTEXITCODE -ne 0) { throw '短裤几何检查失败，勿发布' }
python scripts/production/flow.py validate male-shorts
if ($LASTEXITCODE -ne 0) { throw '最终精确绑定/哈希回读失败，勿发布' }
```

若需要深度全男体审计再跑现有 `audit.py`，它会写 `assets-source/m1b/{audit-report,profile-measurements}.json`；不是只读命令。新检出不会包含本机 `.venv/node_modules`，Python 依赖按 `scripts/m1b-assets/requirements-shorts.txt` 检查安装在合适环境，不自动装包。当前机器已能跑轻量只读回读不代表新的环境依赖自动齐全。CLI 会把本地 ignored Blender 路径显示为缺失，这里已经显式使用主区固定工具 exe；不能忽略其他源缺失。

对未经人工编辑的同一源，预计 `editable-export-1/2.glb` hash 相同，repack 后短裤 SHA 仍为 `c8a1afd0742cbb99302abc107673744751a8cfd77c6c89df039b068054a947d0`。这是待验证目标，不是本次结果。记录源 blend 前后 SHA，应保持 `0339f18b90276136e71fe9cdd9ca2c0b2f31c1951a905c93234efbd3b96cda98`，并检查长裤/上衣/鞋未变。失败不回写主区；保留独立输出与日志，核清原因，不放宽绑定或修改hash求通过。当时仅准备隔离命令；现用户已授权日常修复与备份，合入依据实际检查结果，不另设重复审批。
