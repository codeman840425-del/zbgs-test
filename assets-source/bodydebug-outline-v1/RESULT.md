# 6bc 中性人体重复绘制专项回执

旧固定 `269a73423c97` → 新固定 `6bc09ad85c3d`。共享源码已由 root 局部合入，尚未公开；本回执不代表发布批准。精确原/候选源 SHA 见 README 与历史 manifest。

实际 Chrome 对男女分别执行两轮 `dressed → base → dressed`，两版同身份、同 front 镜头、暂停同骨姿与全部 morph 权重。浏览器均正常关闭，无 pageerror。

| 实际绘制 | 旧版 | 新版 |
|---|---:|---:|
| base Body 主相机组 | 2 | 1 |
| base Body shadow 组 | 2 | 1 |
| base 全局 calls（男女均同） | 112 | 110 |
| female base triangles | 43,574 | 28,110 |
| male base triangles | 42,074 | 27,394 |

穿衣路径计数未变：female 118 calls / 49,534 triangles；male 120 / 48,122。Geometry attrs/index/groups、实际全 Body 蒙皮世界顶点、全部 raw/normalized 骨姿 hash、全部 morph 权重及相机完全相同。退出 base 恢复原材质数组与属性；两轮切换无 geometry/texture/program 数量增长。这里报告的是移除重复绘制工作，**没有测整帧耗时收益**。

首次两版截图比较失败，原因是暂停前自动眨眼相位不同（controller.reset 未重置 live 内部时钟），眼部像素不同。保留完整失败 PNG/报告，没有删眼区或放宽像素门槛。经 root 授权，只将 QA 暂停表情设为同一 blink=0，记录全部 morph 权重后重跑。18 项完整 PNG 比较通过，最大色道差 ≤ 1/255；base 与 dressed 均核对同脸。其他动作与运行时逻辑未改。

人工实际查看：旧/新 female base、new male base、两体第二轮 dressed restored 五张完整图，未见此次修改造成躯干/肢体缺失或服装残留；穿衣皮肤点状描边仍在。本次为固定静姿专项检查，不能继承为整套动作、连续自然度、正常穿衣描边修复或目标设备性能通过。

## 可恢复证据

- `evidence/index.json`：46 文件，共 6,316,821 bytes；每项原路径、字节数与 SHA256。
- `evidence/initial-blink-mismatch/`：首次旧/新共 20 PNG + 2 完整报告。
- `evidence/sameface/`：最终旧/新共 20 PNG + 2 完整报告。
- `evidence/browser-comparison*.json`：保留首次失败及最终通过，未覆盖历史。
- `scripts/qa-bodydebug-outline.cjs`：真实浏览器专项入口，精确固定旧/新 build。
- `compare-browser.py`：全图比较，无 mask；目标已存在时拒绝覆盖。

新检出不依赖 ignored output 即可验归档并复算最终图像比较（需 Pillow）：

```powershell
python assets-source/bodydebug-outline-v1/archive-browser.py
python assets-source/bodydebug-outline-v1/compare-browser.py assets-source/bodydebug-outline-v1/evidence/sameface/before assets-source/bodydebug-outline-v1/evidence/sameface/after output/bodydebug-sameface-recheck.json
```

`prepare.py` 是旧 SHA 的历史补丁生成器；共享源码已变为新 SHA，不能现在用它覆写历史生成物。Node 与浏览器检查的覆盖范围不同，详见 README。screenCoordinates 描边候选没有合入。
