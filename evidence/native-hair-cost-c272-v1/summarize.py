"""Read retained samples only. Never launch a browser or alter original reports."""
from pathlib import Path
import hashlib,json
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):return dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size)
def stats(v):
    v=sorted(v)
    import math
    q=lambda p:v[math.ceil(len(v)*p)-1]
    return dict(count=len(v),mean=sum(v)/len(v),p50=q(.5),p95=q(.95),p99=q(.99),max=v[-1],over20ms=sum(x>20 for x in v),over33_333ms=sum(x>100/3 for x in v),over50ms=sum(x>50 for x in v),over100ms=sum(x>100 for x in v))
def main():
    first=json.loads((BASE/'report.json').read_bytes())
    rejected=json.loads((BASE/'walk-only-corrected/report.json').read_bytes())
    last=json.loads((BASE/'independent-walk-completed/report.json').read_bytes())
    assert first['status']=='development-short-samples-complete' and rejected['status']=='failed' and last['status']=='development-short-samples-complete'
    assert 'Walking distance too small' in rejected['error']
    rows=[]
    sources=[('original','walk',BASE/'walk-only-corrected/original-walk-raw.json',None),
             ('original','seated',BASE/'original-seated-raw.json',first['samples'][1]),
             ('native-male-hairset001-v1','walk',BASE/'independent-walk-completed/native-male-hairset001-v1-walk-raw.json',last['samples'][0]),
             ('native-male-hairset001-v1','seated',BASE/'native-male-hairset001-v1-seated-raw.json',first['samples'][3])]
    for style,phase,p,record in sources:
        raw=json.loads(p.read_bytes())
        if phase=='walk':assert len(raw['behavior'])>=40 and all(x['mode']=='walk' for x in raw['behavior'])
        else:assert record['before']['snapshot']['mode']=='sit' and record['after']['snapshot']['mode']=='sit' and record['after']['snapshot']['motion']['sitProgress']>.999
        r=dict(style=style,phase=phase,raw=ref(p),wallMs=raw['wallMs'],rafIntervalMs=stats([x['intervalMs'] for x in raw['raf'] if x['intervalMs'] is not None]),mainRenderStartIntervalMs=stats([x['renderStartIntervalMs'] for x in raw['frames'] if x['renderStartIntervalMs'] is not None]),renderSubmitCPUms=stats([x['renderSubmitCPUms'] for x in raw['frames']]),hairUpdateDynamicsCPUmsPerCall=stats([x['cpuMs'] for x in raw['dynamics']]),hairUpdateDynamicsCPUmsPerRender=stats([x['hairUpdateCPUms'] for x in raw['frames']]),resources={k:dict(min=min(x[k] for x in raw['frames']),max=max(x[k] for x in raw['frames'])) for k in ['calls','triangles','textures','geometries','programs']},heapBefore=record['before']['heap'] if record else None,heapAfter=record['after']['heap'] if record else rejected['failureSnapshot']['heap'],behaviorObservation=dict(intervalMs=250,count=len(raw.get('behavior',[])),allObservedModeWalk=all(x['mode']=='walk' for x in raw.get('behavior',[]))) if phase=='walk' else 'sit progress >.999 before and after')
        if record:r['simulationSeconds']=record['simulationSeconds']
        else:r['recoveryNote']='Raw statistics recovered without a new browser. All48 observed states are walk; original wrapper failed only its arbitrary >8m distance gate, removed in the final script. Full before snapshot was not saved.'
        rows.append(r)
    s=dict(schema='native-hair-short-cost-selected-samples-v1',status='development-only-short-samples-recorded',build='c2721e32b6ed',sourceCommit=first['sourceCommit'],machine=first['machine'],environment=first['environment'],chrome=first['chrome'],viewport=first['viewport'],acceptedSamples=rows,originalRestoration={k:first[k] for k in ['initialOriginal','restoredOriginal','afterAppearanceDispose']},lastRunRestoration={k:last[k] for k in ['initialOriginal','restoredOriginal','afterAppearanceDispose']},loadedIndependentIdentity=last['samples'][0]['after']['appearance'],originalNativeSpringJointCount=first['samples'][1]['after']['originalSpringJointCount'],inputReports=[ref(BASE/x) for x in ['report.json','first-walk-scope-rejected.json','walk-only-corrected/report.json','independent-walk-completed/report.json']],limitations=['Single short samples from multiple browser batches; not a same-run continuous A/B comparison','First horizontal walk windows contain idle at their ends and are rejected for walking cost','Second original-walk wrapper has an artificial distance rejection; raw valid walking observations are retained and recovered without rerun','Different route for valid walking versus the valid earlier seated samples; all cameras room, viewport1440x1000,DPR1,speed1.05,rate1','RAF and render-start intervals are wall intervals, not isolated main-loop CPU duration','renderSubmitCPUms is CPU wall time inside renderer.render, not GPU duration','Measured appearance.updateDynamics includes proxy sync, official solver and replacement material updates; original body/cloth/native VRM solver CPU was not separated','Timer resolution/instrumentation, sequential order, browser scheduling and thermal state not controlled','No forced GC; JS heap is an observation, not a leak proof','Style restore retains hidden per-actor cache; explicit appearance disposal was separately observed only once','Resource counters include whole room/render passes and do not measure GPU bytes','WMI AdapterRAM is a legacy32-bit field, not reliable4090VRAM capacity; OS Caption suffix decoding is corrupted, numeric OS version/build retained','No ordinary-PC, long-duration, visual/contact or universal-hair performance acceptance'],browserAndTemporaryServersClosed=first['browserAndTemporaryServerClosed'] and rejected['browserAndTemporaryServerClosed'] and last['browserAndTemporaryServerClosed'],gpuWindowReleased=True,newVideoRecorded=False)
    with (BASE/'summary.json').open('xb') as f:f.write((json.dumps(s,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps([dict(style=x['style'],phase=x['phase'],raf=x['rafIntervalMs'],hairCPU=x['hairUpdateDynamicsCPUmsPerRender'],renderCPU=x['renderSubmitCPUms'],resources=x['resources']) for x in rows]))
if __name__=='__main__':main()
