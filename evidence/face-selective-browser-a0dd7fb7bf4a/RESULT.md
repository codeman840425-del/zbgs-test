# a0dd7fb7bf4a 定向浏览器回归

固定源码：4cb4503d43595cdbadfe532e44ecbf4b206dc9c2。固定目录：experiments/face-snapshot-fixed-v1/prototype/dist。通过 run-fixed-check 临时服务执行；Chrome 与服务已关闭。

19 组程序检查全部通过，0 pageerror、0 HTTP >=400。记录一条既有 Three Source→TextureSource 更名警告。原女、原男、男性下颌样件的实际 VRM SHA、服务构建与运行构建均通过身份门；同文档切换、合法配方实际文件读入/下载一致、原引用恢复、三页签及两个入口 favicon.svg 的真实 CDP 200/MIME 均通过。

原女/原男按现有范围检查嘴→眼→眉→组合→复位，男性下颌仅嘴端点。两轮真实 UI 唇色/嘴宽交替后三体的第二轮结束减第一轮结束 programs/geometries/textures 全为 0/0/0；这仅是有界资源趋势，不是无限生命周期无泄漏证明。额外 503 浏览器矩阵未执行；失败重试由本次 prepare CPU 反例单列覆盖。

## 视觉与时钟

已实际逐张查看全部 9 张同姿中性/aa/happyblink 对照，以及原生影片全时段 2fps 的 9 张时序图（约 0–32 秒）。在这些图中未见新增明显黑斑、五官缺片或脱落。男女与样件的 UI 过渡、讲话/眨眼、回中性均可见。完整原生 1600×1000 影片保留在观看页；影片含明确暂停的静态诊断，不把整条都称为连续角色动作。

| 真实讲话窗口 | wall 秒 | simulation 秒 | 最大 rAF 间隔 ms |
|---|---:|---:|---:|
| 原女 | 6.9282 | 6.9280 | 6.8 |
| 原男 | 6.9161 | 6.9156 | 6.3 |
| 男性下颌 | 6.9343 | 6.9339 | 6.2 |

这是开发机 headless Chrome、录像中的短讲话窗口，不含首次加载/编辑卡顿。不能据此否定根单独测得的首次 draw/出帧长帧，也不代表普通电脑通过。工程观看是全时段抽帧，不冒称连续人工自然度验收。

## 执行与范围

```powershell
node scripts/run-fixed-check.cjs experiments/face-snapshot-fixed-v1/prototype/dist scripts/qa-face-selective-browser.cjs --build=a0dd7fb7bf4a --out=evidence/face-selective-browser-a0dd7fb7bf4a
python scripts/package-face-selective-review.py --out=evidence/face-selective-browser-a0dd7fb7bf4a
```

复跑须换新输出目录。执行脚本、原始 report/trace、gzip、原片、截图、抽帧及 SHA 清单均保存。未执行已否决 firstuse/context 试验，未重测动作/裙/30 秒舞，未修改产品。程序通过与本报告有限视觉结论分开。
