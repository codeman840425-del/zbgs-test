"""Summarize the one preserved 77 sample; never starts a browser."""
from pathlib import Path
import json,gzip,hashlib,math,collections,sys
root=Path(__file__).resolve().parent
source=Path(sys.argv[1]) if len(sys.argv)>1 else root/'report.json.gz'
raw=gzip.decompress(source.read_bytes()) if source.suffix=='.gz' else source.read_bytes()
d=json.loads(raw)
assert d['build']=='77e46efb5441' and d['passed'] and d['headless'] and not d['detail']
def stats(values):
 a=sorted(x for x in values if isinstance(x,(int,float)) and math.isfinite(x))
 if not a:return {'count':0}
 return dict(count=len(a),mean=sum(a)/len(a),p50=a[min(len(a)-1,int(len(a)*.5))],p95=a[min(len(a)-1,int(len(a)*.95))],p99=a[min(len(a)-1,int(len(a)*.99))],max=a[-1],over16_667=sum(x>1000/60 for x in a),over33_34=sum(x>33.34 for x in a),over50=sum(x>50 for x in a))
result={k:d[k] for k in ['schema','build','detail','headless','scriptSHA256','sampleSeconds','viewport','browser','meta','errors','passed','limitations']}
result['environmentLimit']='Other existing Chrome processes were not closed; agents suspended heavy work, but absolute machine isolation is not established.'
result['identity']={'sourceDigest':d['gate']['runtimeBuild']['sourceDigest'],'primary':d['gate']['primary'],'final':d['finalGate']['primary']}
result['cases']=[]
for c in d['results']:
 rows=c['frames'];n=len(rows);v=c['validity'];cfg=c['config'];inspection=c['sampleStart']['inspection']
 assert c['valid'] and v['invalidStateFrames']==v['missingInstrumentedFrames']==v['exclusiveOverSceneFrames']==0
 q={'config':cfg,'validity':v,'wallMs':c['wallMs'],'simulationSeconds':c['end']['simulationTime']-c['sampleStart']['simulationTime'],
 'actualSetup':{k:inspection[k] for k in ['bodyMode','dynamics','corrections']},'outfit':c['sampleStart']['outfit'],
 'cameraConstantAtEndpoints':c['sampleStart']['camera']==c['end']['camera'],
 'dutyPercent':{'moving':100*v['movingFrames']/n,'runSpeedOver1_5':100*v['runningSpeedFrames']/n,'peerMoving':100*v['peerMovingFrames']/n},
 'inclusive':{k:stats([r.get(k) for r in rows]) for k in c['summary']},
 'exclusive':{k:stats([r['exclusive'].get(k) for r in rows]) for k in c['summary']},
 'calls':{k:stats([r['calls'].get(k,0) for r in rows]) for k in ['primarySimulateMs','motionMs','avatarMs','vrmMs','garmentMs','renderSubmitMs']},
 'substepGroups':{},'resourcesEnd':c['resources']}
 for count in sorted(set(r['calls']['primarySimulateMs'] for r in rows)):
  group=[r for r in rows if r['calls']['primarySimulateMs']==count]
  q['substepGroups'][str(count)]={'frames':len(group),'cpuUpdateMs':stats([r['cpuUpdateMs'] for r in group]),'motionMs':stats([r.get('motionMs') for r in group])}
 q['exclusiveSumPerFrame']=stats([sum(r['exclusive'].values()) for r in rows])
 q['sceneUninstrumentedMs']=stats([r['cpuUpdateMs']-sum(r['exclusive'].values()) for r in rows])
 result['cases'].append(q)
(root/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# 77 固定版开发机持续性能短测','','九类各一次30秒有效样本；无头Chrome、1440×900、detail=0，无录像/CPU限速。9/9实际状态与计时覆盖门通过，0pageerror。不是普通电脑或手机通过，用户目前无普通电脑，缺口保留。','','| case | frame P50/P95/P99/max ms | CPU P50/P95/P99/max ms | >16.667 / >33.34 / >50帧 | moving / run / peer % |','|---|---|---|---|---|']
for c in result['cases']:
 f=c['inclusive']['frameMs'];u=c['inclusive']['cpuUpdateMs'];a=c['dutyPercent']
 fmt=lambda s:'/'.join(f'{s[k]:.2f}' for k in ['p50','p95','p99','max'])
 lines.append(f"|{c['config']['name']}|{fmt(f)}|{fmt(u)}|{f['over16_667']}/{f['over33_34']}/{f['over50']}|{a['moving']:.1f}/{a['runSpeedOver1_5']:.1f}/{a['peerMoving']:.1f}|")
lines+=['','## CPU分项（每render帧exclusive平均ms）','','下面只移除已插桩子调用的嵌套时间，不代表完整CPU/GPU分解。raw inclusive不可相加；每子步avatar包含vrm等调用，motion包含其衣面/VRM同步。dual时同名timer累积两角色，simulate仍为主scene对子步的一次调用。','','| case | simulate自身 | motion | avatar自身 | vrm | garment | render提交 |','|---|---:|---:|---:|---:|---:|---:|']
for c in result['cases']:
 lines.append('|'+c['config']['name']+'|'+'|'.join(f"{c['exclusive'][k].get('mean',0):.3f}" for k in ['primarySimulateMs','motionMs','avatarMs','vrmMs','garmentMs','renderSubmitMs'])+'|')
lines+=['','## 状态与预算边界','','- 基础模式按既有脚本关闭dynamic；裤/裙开启dynamic，故不是只换一件衣物的成本A/B。样本含转向、终点停止及250ms轮询空隙；两跑步档实际speed>1.5只约46%，不能称30秒全程匀速跑。双实例两者均有实际移动。坐稳全部帧sit，切换样本实际包含sit/stand。','- 本机Chrome 157.0.8103.51 headless，WebGL实际ANGLE NVIDIA RTX4090/D3D11；Windows11，WMI CPU名称9950X3D但本环境暴露8核/8逻辑，物理内存约66.16GB。浏览器deviceMemory32是浏览器暴露值；不能用WMI AdapterRAM截断字段声称4090仅4GB。','- 两裙裤实例CPU P95=11.5ms、P99=14.4ms，已接近16.667ms参考整帧预算，且本timer不含全部浏览器/GPU完成成本。双裤有单帧37.6ms；不能据多数帧低于预算宣称稳定60FPS或目标设备达标。','- 无头帧间隔中位约6.1ms不是显示器呈现帧率；preupdate→preupdate只测wall pacing。cpuUpdate为Phaser preupdate→postupdate跨度，含场景/Three CPU提交与UI，排除后续Phaser render、浏览器layout/composite、GPU完成。','- summary保留inclusive/exclusive P50/P95/P99、实际调用数、子步分组与资源计数。detail0无handFit细分，未把最后子步handFit当整帧。子步按实际dt决定；不能将两子步帧直接比较一子步归因函数退化。','- garment计时只包裹公开updateGarment方法；接近零不代表裙几何免费。真实衣面刷新还会由motion内部seatHandSurfaces及avatar更新触发，这些仍在相应CPU跨度内；detail0不分离其具体成本。','- 资源为每case结束renderer几何/纹理/绘制调用和JS heap快照，不是VRAM或泄漏证明；同页九case累积已加载缓存，未强制GC。','- 已协调agent无构建/编码/Blender；既有用户Chrome进程未关闭，不能保证整机绝对隔离。自测PASS。只执行一次，不扫参数、不优化、不比较不同浏览器模式或历史版本收益。','', '## 复跑与证据','','执行前运行 `node scripts/qa-m1-current-perf.cjs --self-test`。设QA_M1_BUILD=77e46efb5441、QA_PERF_HEADLESS=1、QA_PERF_DETAIL=0、QA_PERF_SECONDS=30、QA_M1_RUN_ROOT为新目录，移除QA_PERF_CASES筛选后：','','```powershell','node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-current-perf.cjs','```','','原大report无损gzip保留；本summarize.py可从report.json.gz复算。实际执行脚本、build-info、hardware、self-test、execution日志及manifest归档。浏览器及临时服务已关闭，无产品改动。']
(root/'RESULT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'cases':len(result['cases']),'passed':d['passed'],'frames':sum(c['validity']['frames'] for c in result['cases'])}))
