"""Read-only replay of existing timing logs; never launches browser/GPU."""
import hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'evidence/face-shadow-cause-a7efd-v1/run-v1'
report=json.loads((BASE/'report.json').read_text(encoding='utf-8'))
rows=[]
for case in report['cases']:
    raw=json.loads((BASE/case['raw']).read_text(encoding='utf-8'))
    peak=max((r for r in raw['renders'] if r['label']=='first-mouth'),key=lambda r:r['end']-r['start'])
    duration=peak['end']-peak['start']
    logs=case['summary']['infoLogs']
    assert all(x.get('program',{}).get('glID')==x['glID'] for x in logs)
    assert all(any(y['glID']==x['glID'] for y in case['summary']['links']) for x in logs)
    assert all(peak['start']<=x['start']<=x['end']<=peak['end'] for x in logs)
    depth=sum(x['end']-x['start'] for x in logs if x['pass']['kind']=='shadow')
    main=sum(x['end']-x['start'] for x in logs if x['pass']['kind']=='main')
    shadow=sum(x['end']-x['start'] for x in raw['shadows'] if peak['start']<=x['start']<=x['end']<=peak['end'])
    rows.append({'tag':case['tag'],'peakRenderMs':duration,'enclosedShadowRenderMs':shadow,'depthInfoLogMs':depth,'mainInfoLogMs':main,'depthInfoLogOverRender':depth/duration,'shadowRenderOverRender':shadow/duration,'depthShareOfObservedInfoLogs':depth/(depth+main),'peakRAFMs':case['summary']['frames']['max'],'programIdentityMatched':True,'allInfoLogsInsidePeakRender':True,'setMs':case['summary']['setMs']})
assert len({tuple(sorted((a['url'],a['sha256']) for a in c['assets'])) for c in report['cases']})==1
same=[]
for body in ['female','male']:
    pair=[c for c in report['cases'] if c['environment']['body']==body]
    mainKeys=[sorted(x['program']['cacheKey'] for x in c['summary']['infoLogs'] if x['pass']['kind']=='main') for c in pair]
    same.append({'body':body,'mainProgramCacheKeysEqual':mainKeys[0]==mainKeys[1]})
archives=[]
for name in ['ab074','a7efd']:
    f=ROOT/f'evidence/visible-face-ui-cost-{name}/executed-script.cjs';b=f.read_bytes()
    archives.append({'path':f.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(b).hexdigest(),'headlessTrue':b'headless:true' in b})
result={'sourceReportSHA256':hashlib.sha256((BASE/'report.json').read_bytes()).hexdigest(),'cases':rows,'mainKeyComparison':same,'allCasesSameLoadedJS':True,'costArchives':archives,'limits':['CPU nested call returns; do not add depth infoLog to enclosing shadow/render durations','Headless rAF is not physical-screen presentation','One process per condition, cross-body counter-order only; driver cache and idle pose not controlled']}
pathlib.Path(__file__).with_name('analysis.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
