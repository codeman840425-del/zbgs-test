# 双人沙发使用点复验

使用固定交付 `seat-contact-v1`，构建 `003c5c0e9a18`。原样房间为包内 `data/rooms/textile-rental/save.json`，沙发实例为 `textile-rental/ground/rest/sofa`，资源为 `sofa-textile-arch@1`。

## 运行

解包后，在该包的 `source` 根目录运行以下 PowerShell 命令。将第一行路径换成探针、输入和样例存档所在目录。依赖使用该包 `prototype` 内的锁文件。

```powershell
$seatProofDir = 'F:/gamemake-company-platform-c1/evidence/company-mouse-pad-release-v1/use-points'
npm ci --ignore-scripts --prefix prototype
node "$seatProofDir/probe-usepoints.mjs" "$seatProofDir/seat-input.json" "../seat-proof-replay"
```

运行只读取包内源码、真实 GLB 和探针同目录的原样存档，将回执及恢复存档写入指定输出目录。复验在封存包 `source` 的独立副本上用包本地的锁定依赖完成。全程使用 Node，无需启动服务。

## 环境侧已证

| 完整使用点 ID | 世界锚点（米） | 接近点（米） | 退出点（米） | 接触网格 |
| --- | --- | --- | --- | --- |
| `textile-rental/ground/rest/sofa#left` | `[-0.76,0,4.40]` | `[0.22,0,4.40]` | `[0.35,0,4.40]` | `seat-left`、`back-left` |
| `textile-rental/ground/rest/sofa#right` | `[-0.76,0,3.44]` | `[0.22,0,3.44]` | `[0.35,0,3.44]` | `seat-right`、`back-right` |

两点均声明容量 1，世界朝向为 +X，yaw 为 π/2。真实实例每座用中心点和局部 ±2 cm 四点射线测得座高 0.470 m，并命中各自的靠背网格。进入建筑模式后已取得的接触几何仍可用。释放左点后，仍保留的右点可阻止移动沙发；最后一个句柄释放后才允许移动。外部 busy 回调也可阻止编辑。设施编辑拒绝的 `path` 是设施 ID，`details.usePointId` 标出忙碌位；整体恢复拒绝的 `path` 是使用点 ID。

公司存档保存布局及资源依赖，归属于 `company-platform:v1:textile-rental`。新进程能从相同公司键恢复到同一双座几何，异公司读取和导入被拒绝，重开时运行期接触句柄为空。探针允许同点多次读取几何，正式角色验证仍需覆盖 `payload.usePointId` 透传、同点排他、异点并行、角色进出及占用释放，和实身接触。

## 归档

- `probe-usepoints.mjs`、`seat-input.json`、`textile-rental.save.json` 组成可移交输入。
- `verified-round2/receipt.json` 和 `verified-round2/restorable.save.json` 是通过回执和另进程实读的存档。
