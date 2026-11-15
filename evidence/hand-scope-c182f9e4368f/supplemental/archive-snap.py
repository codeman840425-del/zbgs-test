from pathlib import Path
import gzip,json,hashlib,difflib
R=Path(__file__).resolve().parent; E=R/'evidence'
summary=json.loads((E/'rail-diagnostic/summary.json').read_text())
assert summary['queries']==880 and summary['gridBruteMaxDelta']==0 and summary['originalVsReevaluationMaxDelta']==0 and summary['rawWristMaxDelta']==0
assert hashlib.sha256((R/'prototype/src/motion.js').read_bytes()).hexdigest()=='ec79972556d2d75470fdf68e1f27f3c26a9a8e72187f9c9cda0cb58c730e3198'
assert (R/'prototype/src/motion.js').read_bytes()==(E/'c182-motion-original.js').read_bytes()
rows=[]
for tag in ['baseline','candidate']:
 for view in ['room','fixed-diagnostic-close']:
  p=E/f'snap-normal-{tag}/{view}.json.gz'; v=json.loads(gzip.decompress(p.read_bytes()))
  assert not v['errors']
  rows.append({'version':tag,'build':v['build'],'view':view,**{k:v[k]for k in ['wall','sim','ratio','trigger']},'frames':len(v['frames']),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(E/'snap-normal-summary.json').write_text(json.dumps(rows,indent=2))
table='\n'.join(f"| {r['build']} | {r['view']} | {r['wall']:.6f} | {r['sim']:.6f} | {r['ratio']:.6f} | {r['trigger']:.6f} |" for r in rows)
report='''# 精确二次寻路：真实时钟与有限 rail 退出反证

结论：保留 c182，不集成。扩大执行范围确实消除了四个指定姿态的真实手裙交叉，但暴露既有有限 rail 接触最大值的不连续；本次没有修改求解器或阈值。

## 实际正常速度录像

原版 7a86c24e34aa 与候选 c182f9e4368f，均原女性、裙装、完整修正、动态开启、真实 UI 2.4m/s。从 (-3.8,0,2.2) 跑至 (3.8,0,2.2)，任务真实 completed 后立即 action('sit')，保留再寻路 .95s。每版分别 room 完整段和固定诊断近镜头；两次独立实时时钟不是完全同相位同步。

| build | 镜头 | wall秒 | sim秒 | sim/wall | sit命令sim秒 |
|---|---|---:|---:|---:|---:|
'''+table+'''

候选近片在 sim4.718700（trace视频相对 .813900s，子步6ms）出现投影7.512819→2.420101mm，在 sim4.755200（相对 .850700s，子步6.1ms）出现6.702600→0mm。真实时钟仍有修正撤销，不是仅固定120Hz下出现。原版走动没有此手投影。

每版保留视频 .68–.96s 的17个连续原解码帧，无补帧/重采样。已逐张查看配对裁图00/01/02；候选手与裙侧的间距随局部帧变化，图中没有大幅反腕或抬肩，但不能用静态帧表裁决正常速度下新增细跳是否可接受。实际录像齐全，尚未获得用户对此过渡的观感接受。ordinal只代表各片相同时间窗内的解码顺序，不冒充同一模拟时刻。room较小，近片明确是诊断镜头。

## 逐 rail 反证

独立诊断646c3f0a5ab5，四实际时刻共880条左手rail，逐条比较空间grid与暴力全部680个实际裙三角。最大输出差0；原函数与诊断重算差0；四时刻实际raw腕与未插桩c182差0。pageerror0。不是空间索引漏面。

- 4.700：rail89（leftThumbMetacarpal负outward）在[22,25,26]上区间[.0013047911,.0156913439]，最大depth+.0039009187m，对应投影.0119009187m。相邻[373,376,374]也命中。
- 4.708333：同rail89对两面均明确拒绝 `no-projected-segment-interval`，输出0。最强改成rail106（leftIndexIntermediate正lateral），投影.0021673285m；其区间[0,1]，仅at0满足depth门，其余采样低于−.008m。
- 4.741667：rail94（leftThumbProximal负outward）区间[0,.0315938482]，投影.0069614742m。
- 4.750：同rail94对这两面均无投影区间，其他rail也没有正值，最大投影归零。

真实源顶点22=373、26=376，两面共享真实边。没有alpha拒绝、前臂投影或IK clamp造成这两次变化。直接原因是有限手rail投影支持退出表面，而仍非零的最后有效修正立即消失；此现象由新增walk作用范围暴露。不是源腕轨变化，也不是“换面”这个描述本身足以解释。

固定120Hz原腕变化6.033/7.022mm，加上投影向量变化9.734/6.961mm，得到候选实际腕15.048/13.488mm；逐轴分解残差0。旧右腕34mm内跳改善不能掩盖此新增左腕问题。

## 恢复与边界

候选源码已逐bytes恢复，SHA256 ec79972556d2d75470fdf68e1f27f3c26a9a8e72187f9c9cda0cb58c730e3198。portable.patch仍只有执行范围guard一处。诊断单独保存 c182-motion-original.js / diagnostic-motion.js / diagnostic.patch，未写入候选dist；diagnostic-v1-dist才是646，另一次失败准备产生的diagnostic-dist不是该身份。

复跑在F:/gamemake运行 run-fixed-check.cjs，参数依次为对应独立dist、qa-snap-video.cjs、期望build、新输出目录；rail复跑改为diagnostic-v1-dist、qa-rail-local.cjs、646c3f0a5ab5。完整命令见下列可重复脚本。诊断重建先核c182原bytes，再仅在独立worktree把motion.js替换为diagnostic-motion.js，运行npm run build -- --outDir ../diagnostic-v1-dist，然后恢复原bytes和原build-info.json；不得覆盖candidate-dist。源码patch保留便于复核，不要求重跑所有历史门。

本次轻量正常录制没有插入重skin门；wall/sim和startup差保留，不用作性能通过。先前同步simulate粗成本约增加1ms/substep仍有效为范围代价记录，不代表GPU或普通PC。未扩男性/派生/持麦范围，未做平滑、减轨、降频或放宽阈值。所有浏览器/临时server/FFmpeg已结束。
'''
(E/'EXACT-TRANSITION-RESULT.md').write_text(report,encoding='utf-8')
old=(E/'WRIST-SNAP-CAUSE.md').read_text(encoding='utf-8')
marker='**尚未证实的更细原因**' if '**尚未证实的更细原因**' in old else '**后续最短反证已补齐**'
old=old[:old.index(marker)]+'''**后续最短反证已补齐**：精确二次寻路正常1×已录，真实时钟仍出现投影撤销；646诊断880条rail的grid与暴力全680面严格相同。rail89/94在对应时刻退出相邻两面的投影区间，非alpha或空间索引漏选。详细记录、同rail拒绝原因、影片时钟和连续帧限制见 `EXACT-TRANSITION-RESULT.md`。候选仍保留不集成；局部连续帧不等于正常速观感接受。

离线源/修正分解复跑：`python experiments/hand-scope-worktree-1/decompose-snap.py`。最新归档：`python experiments/hand-scope-worktree-1/archive-snap.py` 后运行 `compare.py` 更新哈希清单。未修改候选。
'''
(E/'WRIST-SNAP-CAUSE.md').write_text(old,encoding='utf-8')
p=E/'HAND-SCOPE-RESULT.md';t=p.read_text(encoding='utf-8');t=t.replace('该精确第二次寻路过渡未包含于现有正常片，实际1×可见程度未验。','该精确第二次寻路过渡现已补正常1×room/固定近片，真实时钟仍有投影撤销；880条rail全表反证确认是有限投影区间退出，不是grid漏选。局部17连续帧已审，未替用户接受新增细跳。详细新证据见 `EXACT-TRANSITION-RESULT.md`。');p.write_text(t,encoding='utf-8')
p=E/'hand-scope-index.html';t=p.read_text(encoding='utf-8').replace('精确过渡的正常速度可见性未验。','精确过渡已补1×，真实时钟复现投影撤销；880 rail反证排除grid漏选，仍未通过观感验收。')
if 'id="exact-transition"' not in t:
 section='<section id="exact-transition"><h2>精确二次寻路转接 · 正常1× · 不集成</h2><p><a href="EXACT-TRANSITION-RESULT.md">局部反证与时钟报告</a> · <a href="rail-diagnostic/summary.json">同rail/grid全表反证</a></p>'
 for view,label in [('room','正常房间'),('fixed-diagnostic-close','固定诊断近景')]:
  section+=f'<h3>{label}</h3><div class="pair">'+''.join(f'<div>{tag}<video controls preload="metadata" src="snap-normal-{tag}/{view}.webm"></video></div>'for tag in ['baseline','candidate'])+'</div>'
 section+='<p>各片独立实时时钟，非同相位硬同步。17连续原解码帧只辅助工程观察，不等于正常速度验收。</p>'+''.join(f'<a href="snap-paired-frames/{n:02}.jpg">连续帧表{n+1}</a> 'for n in range(3))+'</section>'
 t=t.replace('<h2>坐起、',section+'<h2>坐起、')
p.write_text(t,encoding='utf-8')
base=(E/'c182-motion-original.js').read_text(encoding='utf-8').splitlines(True);diag=(E/'diagnostic-motion.js').read_text(encoding='utf-8').splitlines(True)
(E/'diagnostic.patch').write_text(''.join(difflib.unified_diff(base,diag,fromfile='a/prototype/src/motion.js',tofile='b/prototype/src/motion.js')),encoding='utf-8')
print(json.dumps({'verifiedQueries':summary['queries'],'films':rows,'productUnchanged':True},indent=2))
